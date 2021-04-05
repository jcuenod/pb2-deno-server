// import { RouterContext } from "https://deno.land/x/oak/mod.ts";
// import { QueryFunction } from "../types.d.ts";

// type ModuleResult = {
//   name: string;
//   vid: string;
// };

let moduleMap;

export default (runQuery) => {
  // set up available modules
  runQuery(
    `SELECT version_id as vid, abbreviation as name FROM module_info`,
  ).then(({ rows }) => {
    moduleMap = Object.fromEntries(rows.map(
      (r) => [r.name, r.vid],
    ));
    console.log(moduleMap);
  });

  return async (context) => {
    const { modulesString, referenceString } = context.params;

    const moduleArray = !modulesString
      ? ["BHSA", "Nestle1904"]
      : modulesString.split("+");
    const moduleIds = moduleArray.map((m) => moduleMap[m]);
    console.log(modulesString, moduleArray, moduleIds);

    const ridChapter = +referenceString;
    console.time("test");

    const query = `
    SELECT
        ${
      moduleIds.map((m, i) =>
        `p${i + 1}.parallel_id as p${i + 1}_parallel_id,
          p${i + 1}.rid as p${i + 1}_rid,
          p${i + 1}.version_id as p${i + 1}_version_id,
          p${i + 1}.text as p${i + 1}_text`
      ).join(",\n")
    }
    FROM
        parallel p1
    ${
      moduleIds.slice(1).map((m, i) =>
        `
    LEFT JOIN
        parallel p${i + 2}
    ON
        p1.parallel_id = p${i + 2}.parallel_id
    AND
        p${i + 2}.version_id = ${m}`
      ).join("\n")
    }
    WHERE
        p1.rid / 1000 = ${ridChapter}
    AND
        p1.version_id = ${moduleIds[0]}
    ORDER BY p1.rid;`;
    // console.log(query);
    const { rows } = await runQuery(query);
    console.timeLog("test");
    const response = rows.map((row) => {
      moduleIds.forEach((_, i) => {
        const text = row[`p${i + 1}_text`];
        try {
          row[`p${i + 1}_text`] = JSON.parse(text);
        } catch (e) {
          row[`p${i + 1}_text`] = row[`p${i + 1}_text`];
        }
      });
      return row;
    });
    console.timeEnd("test");
    context.response.type = "application/json";
    context.response.body = JSON.stringify(response);
  };
};
