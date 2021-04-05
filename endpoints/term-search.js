// import sanitizeParams from "./term-search-util/sanitize-params";
import { b64DecodeUnicode } from "../util/base64.ts";
import singleTermCTE from "./term-search-util/single-term-cte.js";
import invertedSingleTermCTE from "./term-search-util/inverted-single-term-cte.js";

const extractQueriesByType = (queries) => {
  console.log(queries);
  return queries.reduce((a, v, i) => {
    if ("inverted" in v && v.inverted) {
      a.invertedTermQueries.push(v.data);
    } else {
      a.termQueries.push(v.data);
    }
    return a;
  }, { termQueries: [], invertedTermQueries: [] });
};

const groupedWith = (searchTerms, treeNodeType) => {
  const { termQueries, invertedTermQueries } = extractQueriesByType(
    searchTerms,
  );
  if (termQueries.length === 0) {
    throw ("You have to look for something - can't just search for inversions");
  }
  console.log(termQueries);

  const regularCTEs = termQueries
    .map(singleTermCTE(treeNodeType))
    .map((k, i) => `w${i} AS ${k}`);
  const invertedCTEs = invertedTermQueries
    .map(invertedSingleTermCTE(treeNodeType))
    .map((k, i) => `wi${i} AS ${k}`);
  const withClause = regularCTEs.concat(...invertedCTEs).join(",\n\t");

  const selectClause = termQueries
    .map((k, i) => `w${i}.wid AS wid_${i}`)
    .join(",\n\t");

  const fromClause = termQueries
    .map((k, i) => `w${i}`)
    .join(", ");

  const whereClauseItems = [];
  if (termQueries.length > 1) {
    // Tree node must be the same
    whereClauseItems.push(
      termQueries.slice(1).map((k, i) => `w0.tree_node = w${i + 1}.tree_node`)
        .join(" AND "),
    );
    // Set cover must be possible (at least one unique wid per term in query)
    // this is a hard concept to put in human language but:
    // [1,2,3], [2], [3]   = true  //e.g. [1,2,3]
    // [1],[2],[1,2]       = false //[1,2,?]
    // [1,2], [1,2], [1,2] = false //[1,2,?] and [2,1,?]
    whereClauseItems.push(
      "is_set_cover_possible(" + termQueries.map((k, i) =>
        `w${i}.wid`
      ).join(", ") + ")",
      //   whereSameTreeNode,
    );
  }
  if (invertedTermQueries.length > 0) {
    whereClauseItems.push(
      invertedTermQueries
        .map((k, i) =>
          `w0.tree_node NOT IN (SELECT inverted_tree_node_array FROM wi${i})`
        )
        .join(" AND "),
    );
  }
  const whereClause = whereClauseItems.length > 0
    ? "WHERE\n\t" + whereClauseItems.join("\nAND\n\t")
    : "";

  return `
WITH
	${withClause}

SELECT
	w0.tree_node,
	${selectClause}

FROM
	${fromClause}

${whereClause}`;
};

const termSearchEndpoint = (runQuery) =>
  async (context) => {
    // const {
    //   treeNodeType,
    //   term_queries,
    // } = sanitizeParams(params);

    const { base64query } = context.params;
    const queryString = b64DecodeUnicode(base64query);
    const query = JSON.parse(queryString);
    // console.log(query);
    const sqlStatement = groupedWith(query.terms, query.node);
    // console.log(sqlStatement);
    const { rows } = await runQuery(sqlStatement);
    // console.log(result);
    // console.log(result.rows);
    // const { rows } = result;
    context.response.type = "application/json";
    context.response.body = JSON.stringify(rows);
  };

export default termSearchEndpoint;

// const q = {
//   terms: [{
//     data: {
//       "realized_lexeme": "טָהֹר",
//     },
//     inverted: false,
//     uid: 123,
//   }, {
//     data: {
//       "realized_lexeme": "טָהֹר",
//     },
//     inverted: false,
//     uid: 124,
//   }],
//   node: "clause_node_id",
// };

//  'eyJ0ZXJtcyI6W3siZGF0YSI6eyJwYXJ0X29mX3NwZWVjaCI6InZlcmIiLCJzdGVtIjoiaGlmIiwibnVtYmVyIjoic2ciLCJwZXJzb25fcHMiOiJwMyJ9LCJpbnZlcnRlZCI6ZmFsc2UsInVpZCI6MTIzfV0sIm5vZGUiOiJjbGF1c2UifQ=='
//  'eyJ0ZXJtcyI6W3siZGF0YSI6eyJwYXJ0X29mX3NwZWVjaCI6InZlcmIiLCJzdGVtIjoiaG90cCIsIm51bWJlciI6InNnIiwicGVyc29uIjoiMyJ9LCJpbnZlcnRlZCI6ZmFsc2UsInVpZCI6MTIzfSx7ImRhdGEiOnsicGFydF9vZl9zcGVlY2giOiJwcmVwIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9XSwibm9kZSI6ImNsYXVzZV9ub2RlX2lkIn0='
