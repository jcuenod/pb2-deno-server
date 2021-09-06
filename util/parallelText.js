const generateSqlForParallelTextFromIds = ({ moduleIds, parallelIds }) => {
    if (moduleIds.length === 1) {
        console.error("not implemented! Need multiple parallel version (easy fix though)")
    }
    return `
        SELECT *
        FROM parallel
        WHERE
            parallel_id IN (${parallelIds.join(",")})
        AND
            module_id IN (${moduleIds.join(",")})`


    // const zeroTable = moduleIds[0]
    // const remainingTables = moduleIds.slice(1)
    // return `
    // SELECT
    // p${zeroTable}.parallel_id,
    //     ${moduleIds.map(v => `p${v}.rid AS p${v}_rid, p${v}.text AS p${v}_text`).join(", ")}

    // FROM
    //     parallel p${zeroTable}

    // ${remainingTables.map(v => `FULL OUTER JOIN parallel p${v} ON p${zeroTable}.parallel_id = p${v}.parallel_id`).join(" ")}

    // WHERE
    // p${zeroTable}.parallel_id IN (${parallelIds.join(",")})

    // AND
    //     ${moduleIds.map(v => `p${v}.module_id = ${v}`).join(" AND ")}

    // ORDER BY p${zeroTable}.rid
    // `
}

export default generateSqlForParallelTextFromIds


// ON
// ${moduleIds.map(v => `p${zeroTable}.parallel_id = p${v}.parallel_id`).join(" AND ")}