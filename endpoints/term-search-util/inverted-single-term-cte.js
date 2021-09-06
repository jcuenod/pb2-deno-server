/**
 * The point of this function is to return a Common Table Expression (CTE)
 * that will produce all the tree nodes that should be excluded for an
 * inverted search term.
 *
 * This should work on something like:
	{
	  "_vt": "impv",
	  "_vs": "piel"
	}
 *
 */
const invertedSingleTermCTE = treeNodeType => termFeatures => {
	const termKeys = Object.keys(termFeatures)
	// validateKeysOrThrow(termKeys)
	const featureIntersection = termKeys.map((k, i) => `f${i}.word_uids`).join(" & ")
	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")
	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${termFeatures[k]}'`
	).join(" AND ")
	return `(
		SELECT
			word_features.module_id AS module_id,
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
	)`
}

const invertedWhereClause = index =>
	`ROW (w0.module_id, w0.tree_node) NOT IN (SELECT module_id, tree_node FROM wi${index})`

export { invertedSingleTermCTE, invertedWhereClause }