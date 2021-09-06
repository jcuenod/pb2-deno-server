// import sanitizeParams from "./term-search-util/sanitize-params";
import { b64DecodeUnicode } from "../util/base64.ts"
import {
	singleTermCTE,
	singleTermWhereClause,
} from "./term-search-util/single-term-cte.js"
import {
	invertedSingleTermCTE,
	invertedWhereClause,
} from "./term-search-util/inverted-single-term-cte.js"
import generateSqlForParallelTextFromIds from "../util/parallelText.js"

const PAGE_SIZE = 20
const PAGE_SIZE_LIMIT = 100

const extractQueriesByType = (queries) => {
	console.log(queries)
	return queries.reduce(
		(a, v, i) => {
			if ("inverted" in v && v.inverted) {
				a.invertedTermQueries.push(v.data)
			} else {
				a.termQueries.push(v.data)
			}
			return a
		},
		{ termQueries: [], invertedTermQueries: [] }
	)
}

const generateSqlForTreeNodesWithTerms = ({
	searchTerms,
	treeNodeType,
	pageNumber = 0,
	pageSize,
	count = false
}) => {
	// pageNumber = pageNumber || 0
	// count = count || false
	const { termQueries, invertedTermQueries } = extractQueriesByType(searchTerms)
	if (termQueries.length === 0) {
		throw "You have to look for something - can't just search for inversions"
	}

	const regularCTEs = termQueries
		.map(singleTermCTE(treeNodeType))
		.map((k, i) => `w${i} AS ${k}`)
	const invertedCTEs = invertedTermQueries
		.map(invertedSingleTermCTE(treeNodeType))
		.map((k, i) => `wi${i} AS ${k}`)
	const withClause = regularCTEs.concat(...invertedCTEs).join(",\n\t")

	const selectClauseRows = termQueries.map((k, i) => `w${i}.wids AS w${i}_wids, w${i}.module_id AS w${i}_module_id`)
	if (termQueries.length > 1) {
		selectClauseRows.push(
			`(${termQueries
				.map((_, i) => `w${i}.parallel_ids`)
				.join(" | ")}) AS parallel_ids`
		)
	} else {
		selectClauseRows.push(`w0.parallel_ids AS parallel_ids`)
	}
	const selectClause = selectClauseRows.join(",\n\t")

	const fromClause = termQueries
		.map((k, i) => `w${i}`)
		.concat("warm_word_index")
		.join(", ")

	const whereClauseItems = [
		`warm_word_index.module_id = w0.module_id`,
		`warm_word_index.tree_node_type = '${treeNodeType}'`,
		`warm_word_index.tree_node = w0.tree_node`,
	]
	if (termQueries.length > 1) {
		// Tree node must be the same
		whereClauseItems.push(
			termQueries
				.slice(1)
				.map((k, i) => singleTermWhereClause(i + 1, treeNodeType))
				.join(" AND ")
		)
		// ).push("w0.tree_node IS NOT NULL")
		// SET COVER must be possible (at least one unique word_uid per term in query)
		// this is a hard concept to put in human language but:
		// [1,2,3], [2], [3]   = true  //e.g. [1,2,3]
		// [1],[2],[1,2]       = false //[1,2,?]
		// [1,2], [1,2], [1,2] = false //[1,2,?] and [2,1,?]
		whereClauseItems.push(
			"is_set_cover_possible(" +
			termQueries.map((k, i) => `w${i}.wids`).join(", ") +
			")"
			/*   whereSameTreeNode
			 *    cf. `build_tree_node_index.py` (this is it to warm up the
			 *    tree_node around the hot words). Should probably also
			 *    select rids from the tree_node_index (so make sure those
			 *    end up in that index too).
			 **/
		)
	}
	if (invertedTermQueries.length > 0) {
		whereClauseItems.push(
			invertedTermQueries.map((k, i) => invertedWhereClause(i)).join(" AND ")
		)
	}
	const whereClause = whereClauseItems.join("\nAND\n\t")

	const paginationClause =
		`LIMIT ${pageSize} \n` + `OFFSET ${pageSize * pageNumber} `

	if (count) {
		return `
			WITH
			${withClause}
			
			SELECT
				count(w0.tree_node)
			
			FROM
				${fromClause}
			
			WHERE
				${whereClause}`
	}
	else {
		return `
			WITH
			${withClause}
			
			SELECT
				w0.module_id as module_id,
				w0.tree_node,
				warm_word_index.wids,
				${selectClause}
			
			FROM
				${fromClause}
			
			WHERE
				${whereClause}
			
			${paginationClause}`
	}
}

const augmentObjectWithWordArrayOrHtmlString = obj => {
	const augmented = Object.assign({}, obj)
	try {
		augmented["text_as_word_array"] = JSON.parse(obj["text"])
	} catch (e) {
		augmented["text_as_html_string"] = obj[`text`]
	}
	delete augmented["text"]
	return augmented
}




const parsedParams = (b64query) => {
	const queryString = b64DecodeUnicode(b64query)
	const { searchTerms, treeNodeType, modules, pageNumber, pageSize } = JSON.parse(queryString)
	// TODO: sanitizeParams
	return { searchTerms, treeNodeType, modules, pageNumber, pageSize }
}

const termSearchResultCountEndpoint = (runQuery) => async (context) => {
	console.log("STARTING WITH COUNT ENDPOINT")
	const { searchTerms, treeNodeType } = parsedParams(
		context.params.base64query
	)
	console.log("COUNT", searchTerms, treeNodeType)
	const treeNodeWithTermsSql = generateSqlForTreeNodesWithTerms({
		searchTerms,
		treeNodeType,
		count: true
	})
	console.log("COUNT", treeNodeWithTermsSql)
	let count
	try {
		const { rows } = await runQuery(treeNodeWithTermsSql)
		count = Number(rows[0]["count"])
		console.log("COUNT", "results count:", count)
	}
	catch (error) {
		console.log("COUNT", "We apologize, an error has occurred")
		console.log("COUNT", error)
		context.response.type = "application/json"
		context.response.body = JSON.stringify({ data: [] })
		context.response.status = 501
		return
	}
	context.response.type = "application/json"
	context.response.body = JSON.stringify({ data: { count } })
	context.response.status = 200
	console.log("DONE WITH COUNT ENDPOINT")
	return
}
const termSearchEndpoint = (runQuery) => async (context) => {
	const { searchTerms, treeNodeType, modules, pageNumber = 0, pageSize = PAGE_SIZE } = parsedParams(
		context.params.base64query
	)
	if (pageSize > PAGE_SIZE_LIMIT) {
		pageSize = PAGE_SIZE_LIMIT
	}
	console.log("\n\n\n\n\n")
	console.log(searchTerms, treeNodeType, pageNumber, "page_size:", pageSize)
	const treeNodeWithTermsSql = generateSqlForTreeNodesWithTerms({
		searchTerms,
		treeNodeType,
		pageNumber,
		pageSize
	})
	console.log(treeNodeWithTermsSql)
	let matchingTreeNodes
	try {
		const { rows } = await runQuery(treeNodeWithTermsSql)
		matchingTreeNodes = rows
		console.log("results...", matchingTreeNodes)
	}
	catch (error) {
		console.log(error)
		context.response.type = "application/json"
		context.response.body = JSON.stringify({ data: [] })
		context.response.status = 501
		return
	}
	if (matchingTreeNodes.length === 0) {
		// No results, no use continuing
		console.log("no results")
		context.response.type = "application/json"
		context.response.body = JSON.stringify({ data: [] })
		return
	}
	console.log("carrying on to look for parallels...")

	const parallelIdSet = new Set(
		matchingTreeNodes.reduce((a, v) => a.concat(...v["parallel_ids"]), [])
	)
	console.log(parallelIdSet)

	// const moduleIds = modules.map(abbreviation => module_id)
	const moduleIds = [7, 1, 6]
	const parallelTextSql = generateSqlForParallelTextFromIds({
		moduleIds,
		parallelIds: Array.from(parallelIdSet),
	})
	console.log(parallelTextSql)

	let parallelResult
	try {
		parallelResult = await runQuery(parallelTextSql)
		console.log(parallelResult)
	}
	catch (error) {
		console.log(error)
		context.response.type = "application/json"
		context.response.body = JSON.stringify({ data: [] })
		context.response.status = 501
		return
	}

	try {
		const { rows: parallelText } = parallelResult
		const augmentedParallelText = parallelText.map(augmentObjectWithWordArrayOrHtmlString)
		if (augmentedParallelText.length > 0) {
			const parallelTextByParallelId = Object.fromEntries(
				Array.from(parallelIdSet).map(pId => [pId, augmentedParallelText.filter(r => r.parallel_id === pId)])
			)

			// const parallelTextByParallelId = Object.fromEntries(
			// 	parallelText.map((p) => [p.parallel_id, p])
			// )
			console.log(parallelTextByParallelId)
			const matchingTreeNodesWithParallelText = matchingTreeNodes.map((matchingTreeNode) => {
				const parallel_text = matchingTreeNode["parallel_ids"].map((parallelId) => ({
					parallel_id: parallelId,
					modules: parallelTextByParallelId[parallelId],
				}))
				return Object.assign(matchingTreeNode, {
					parallel_text,
				})
			})
			console.log(matchingTreeNodes)
			// const actualResults = await pageOfParallelResults({ matchingTreeNodes, page: 0, modules: ["BHSA, NET"] })
			// console.log(result);
			// console.log(result.rows);
			// const { rows } = result;

			context.response.type = "application/json"
			context.response.body = JSON.stringify({
				data: matchingTreeNodesWithParallelText
			})
			// context.response.body = JSON.stringify(actualResults)
		}
		else {
			context.response.type = "application/json"
			context.response.body = JSON.stringify({ data: [] })
		}
	} catch (e) {
		console.log(e)
	}
}

export { termSearchEndpoint, termSearchResultCountEndpoint }

// const q = {
//   terms: [{
//     data: {
//       "realized_lexeme": "טָהֹר",
//     },
//     inverted: false,
//     uid: 123,
//   }, {
//     data: {
//       "realized_lexeme": "מַיִם",
//     },
//     inverted: false,
//     uid: 124,
//   }, {
//     data: {
//       "realized_lexeme": "זרק"
//     },
//     inverted: true,
//     uid: 125
//   }, {
//     data: {
//       "mood": "impv"
//     },
//     inverted: true,
//     uid: 126
//   }, {
//     data: {
//       "part_of_speech": "prep"
//     },
//     inverted: true,
//     uid: 127
//   }],
//   node: "clause_node_id",
// };

//  'eyJ0ZXJtcyI6W3siZGF0YSI6eyJwYXJ0X29mX3NwZWVjaCI6InZlcmIiLCJzdGVtIjoiaGlmIiwibnVtYmVyIjoic2ciLCJwZXJzb25fcHMiOiJwMyJ9LCJpbnZlcnRlZCI6ZmFsc2UsInVpZCI6MTIzfV0sIm5vZGUiOiJjbGF1c2UifQ=='
//  'eyJ0ZXJtcyI6W3siZGF0YSI6eyJwYXJ0X29mX3NwZWVjaCI6InZlcmIiLCJzdGVtIjoiaG90cCIsIm51bWJlciI6InNnIiwicGVyc29uIjoiMyJ9LCJpbnZlcnRlZCI6ZmFsc2UsInVpZCI6MTIzfSx7ImRhdGEiOnsicGFydF9vZl9zcGVlY2giOiJwcmVwIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9XSwibm9kZSI6ImNsYXVzZV9ub2RlX2lkIn0='
//  'eyJ0ZXJtcyI6W3siZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXmNa415TWudeoIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXnta315nWtNedIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjR9XSwibm9kZSI6ImNsYXVzZV9ub2RlX2lkIn0='
// 3 terms (1 inverted) eyJ0ZXJtcyI6W3siZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXmNa415TWudeoIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXnta315nWtNedIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjR9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXlteo16cifSwiaW52ZXJ0Ijp0cnVlLCJ1aWQiOiIxMjUifV0sIm5vZGUiOiJjbGF1c2Vfbm9kZV9pZCJ9
// 4 terms (2 inverted) eyJ0ZXJtcyI6W3siZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXmNa415TWudeoIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXnta315nWtNedIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjR9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXlteo16cifSwiaW52ZXJ0ZWQiOnRydWUsInVpZCI6IjEyNSJ9LHsiZGF0YSI6eyJtb29kIjoiaW1wdiJ9LCJpbnZlcnRlZCI6dHJ1ZSwidWlkIjoiMTI1In1dLCJub2RlIjoiY2xhdXNlX25vZGVfaWQifQ==

// Use me:
// eyJ0ZXJtcyI6W3siZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXmNa415TWudeoIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXnta315nWtNedIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjR9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXlteo16cifSwiaW52ZXJ0ZWQiOnRydWUsInVpZCI6MTI1fSx7ImRhdGEiOnsibW9vZCI6ImltcHYifSwiaW52ZXJ0ZWQiOnRydWUsInVpZCI6MTI2fSx7ImRhdGEiOnsicGFydF9vZl9zcGVlY2giOiJwcmVwIn0sImludmVydGVkIjp0cnVlLCJ1aWQiOjEyN31dLCJub2RlIjoiY2xhdXNlX25vZGVfaWQifQ==

// a sg without a masc:
// const q = {
//   terms: [{
//     data: {
//       "gender": "m", //watch out for "masc" vs "m"
//     },
//     inverted: false,
//     uid: 123,
//   }, {
//     data: {
//       "number": "sg"
//     },
//     inverted: true,
//     uid: 127
//   }],
//   node: "clause_node_id",
// };
// eyJ0ZXJtcyI6W3siZGF0YSI6eyJnZW5kZXIiOiJtIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJudW1iZXIiOiJzZyJ9LCJpbnZlcnRlZCI6dHJ1ZSwidWlkIjoxMjd9XSwibm9kZSI6ImNsYXVzZV9ub2RlX2lkIn0=

// a sg anything
// const q = {
//   terms: [{
//     data: {
//       "number": "sg"
//     },
//     inverted: true,
//     uid: 127
//   }],
//   node: "clause_node_id",
// };
// eyJ0ZXJtcyI6W3siZGF0YSI6eyJudW1iZXIiOiJzZyJ9LCJpbnZlcnRlZCI6ZmFsc2UsInVpZCI6MTI3fV0sIm5vZGUiOiJjbGF1c2Vfbm9kZV9pZCJ9
