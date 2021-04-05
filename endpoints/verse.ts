import { RouterContext } from "https://deno.land/x/oak/mod.ts";
import { QueryFunction } from "../types.d.ts";

export default (runQuery: QueryFunction) =>
  async (context: RouterContext) => {
    console.log(context);
    const { moduleId, rid } = context.params;
    console.time("test");
    const { rows } = await runQuery(
      `SELECT verse_text as verseText FROM parallel WHERE version_id = ${moduleId} AND rid = ${rid} ORDER BY rid;`,
    );
    console.timeEnd("test");
    context.response.body = JSON.stringify(rows);
  };
