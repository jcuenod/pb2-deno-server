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
const invertedSingleTermCTE = tree_node_type => term_features => {
	const termKeys = Object.keys(term_features)
	// validateKeysOrThrow(termKeys)
	const featureIntersection = termKeys.map((k, i) => `f${i}.word_uids`).join(" & ")
	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")
	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${term_features[k]}'`
	).join(" AND ")
	return `(
		SELECT
			word_features.version_id AS version_id,
			word_features.${tree_node_type} AS tree_node
		FROM (
				SELECT
					UNNEST(${featureIntersection}) AS word_uid
				FROM
					${fromClause}
				WHERE
					${whereClause}
			) AS word_uid_list,
			word_features
		WHERE
			word_uid_list.word_uid = word_features.word_uid)`
}

const invertedWhereClause = index =>
	`ROW (w0.tree_node, w0.version_id) NOT IN (SELECT tree_node, version_id FROM wi${index})`

export { invertedSingleTermCTE, invertedWhereClause }