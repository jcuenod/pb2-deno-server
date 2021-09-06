/**
 * The point of this function is to return a Common Table Expression (CTE)
 * that will produce all the word_uids with the appropriate "tree_node" id that
 * match a set of features. We use the feature_index table that aggregates
 * and indexes feature data from word_features and use the intarray extension
 * to intersect the word_uids that match features.
 *
 * This should work on something like:
	{
	  "_vt": "impv",
	  "_vs": "piel"
	}
 *
 */

// If treeNodeType = parallel_id, there's no need to match on MODULE_id
const DONT_MODULE_MATCH = "parallel_id"

const singleTermCTE = treeNodeType => termFeatures => {
	const termKeys = Object.keys(termFeatures)
	const featureIntersection = termKeys.map((k, i) => `f${i}.word_uids`).join(" & ")

	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")

	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${termFeatures[k]}'`
	).join(" AND ")

	const possibleModuleSelect = treeNodeType === DONT_MODULE_MATCH
		? ""
		: "word_features.MODULE_id AS MODULE_id,"
	const possibleModuleGroup = treeNodeType === DONT_MODULE_MATCH
		? ""
		: "MODULE_id,"

	return `(
		SELECT
			uniq(array_agg(word_features.parallel_id)) as parallel_ids,
			array_agg(word_features.wid) AS wids,
			${possibleModuleSelect}
			word_features.${treeNodeType} AS tree_node
		FROM (
				SELECT
					(${featureIntersection}) AS word_uid
				FROM
					${fromClause}
				WHERE
					${whereClause}
			) AS word_uid_list,
			word_features
		WHERE
			word_features.word_uid = ANY (word_uid_list.word_uid) AND
			word_features.${treeNodeType} IS NOT NULL
		GROUP BY
			${possibleModuleGroup}
			tree_node
	)`
}

const moduleMatch = (flag) =>
	flag ? "" : ` AND w0.MODULE_id = w${index}.MODULE_id`
const singleTermWhereClause = (index, treeNodeType) =>
	`w0.tree_node = w${index}.tree_node` + moduleMatch(index, treeNodeType === DONT_MODULE_MATCH)

export { singleTermCTE, singleTermWhereClause }