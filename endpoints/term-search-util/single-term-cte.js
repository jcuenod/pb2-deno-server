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
const singleTermCTE = tree_node_type => term_features => {
	const termKeys = Object.keys(term_features)
	const featureIntersection = termKeys.map((k, i) => `f${i}.word_uids`).join(" & ")

	const fromClause = termKeys.map((k, i) =>
		`feature_index AS f${i}`
	).join(",\n\t\t\t\t\t")

	const whereClause = termKeys.map((k, i) =>
		`f${i}.feature = '${k}' AND f${i}.value = '${term_features[k]}'`
	).join(" AND ")

	return `(
		SELECT
			array_agg(word_uid_list.word_uid) AS word_uid,
			word_features.${tree_node_type} AS tree_node,
			word_features.version_id AS version_id
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
			word_uid_list.word_uid = word_features.word_uid
		GROUP BY
			tree_node, version_id)`
}
export default singleTermCTE