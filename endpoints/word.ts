import { RouterContext } from "https://deno.land/x/oak/mod.ts";
import { QueryFunction } from "../types.d.ts";

export default (runQuery: QueryFunction) =>
  async (context: RouterContext) => {
    console.time("test");
    const { moduleId, wid } = context.params;
    const { rows } = await runQuery(
      `SELECT 
            wid,
            version_id as versionId,
            *
           FROM
            word_features
           WHERE
            version_id = ${moduleId}
           AND
            wid = ${wid};`,
    );
    const response = Object.keys(rows[0])
      .filter((k) => rows[0][k] !== null)
      .map(
        (k) => ({ key: k, value: rows[0][k] }),
      );
    context.response.type = "application/json";
    context.response.body = JSON.stringify(response);
    console.timeEnd("test");
  };
