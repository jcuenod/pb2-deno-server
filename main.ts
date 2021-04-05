import wordEndpoint from "./endpoints/word.ts";
import verseEndpoint from "./endpoints/verse.ts";
import chapterEndpoint from "./endpoints/chapter.js";
import termSearchEndpoint from "./endpoints/term-search.js";

import { Application, Router } from "https://deno.land/x/oak@v6.5.0/mod.ts";
import { oakCors } from "https://deno.land/x/cors/mod.ts";

import { Pool } from "https://deno.land/x/postgres@v0.8.0/mod.ts";
import { PoolClient } from "https://deno.land/x/postgres@v0.8.0/client.ts";

const POOL_CONNECTIONS = 20;
const dbPool = new Pool(
  {
    user: "postgres",
    password: "toor",
    database: "parabible",
    hostname: "172.17.0.1",
    port: 5432,
  },
  POOL_CONNECTIONS,
);

async function runQuery(query: string) {
  // const client: PoolClient = await dbPool.connect();
  const client: PoolClient = await dbPool.connect();
  const dbResult = await client.queryObject(query);
  client.release();
  return dbResult;
}

const router = new Router();
router
  .get("/", (context) => {
    context.response.body = "Hello world!";
  })
  .get("/api/v2/word/:moduleId/:wid", wordEndpoint(runQuery))
  .get("/api/v2/verse/:moduleId/:rid", verseEndpoint(runQuery))
  .get(
    "/api/v2/chapter/:modulesString/:referenceString",
    chapterEndpoint(runQuery),
  )
  .get(
    "/api/v2/termSearch/:base64query",
    termSearchEndpoint(runQuery),
  )
  .get("/api/v2/parallel/:parallelId/:modules", async (context) => {
    console.log(context);
    const { parallelId, modules } = context.params;
    console.time("test");
    const results = await runQuery(
      `SELECT * FROM parallel WHERE parallel_id = ${parallelId} AND version_id IN ${modules};`,
    );
    console.timeEnd("test");
    context.response.body = JSON.stringify(results.rows);
  });

const app = new Application();
app.use(oakCors({ origin: "*" }));
app.use(router.routes());
app.use(router.allowedMethods());

await app.listen({ port: 8080 });

// Single chapter lookup with `chapter`:
// http://localhost:8080/api/v2/chapter/BHSA/26036

// Word lookup with `word`:
// http://localhost:8080/api/v2/word/7/282934

// Search for terms with `termSearch`:
// http://localhost:8080/api/v2/termSearch/eyJ0ZXJtcyI6W3siZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXmNa415TWudeoIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjN9LHsiZGF0YSI6eyJyZWFsaXplZF9sZXhlbWUiOiLXnta315nWtNedIn0sImludmVydGVkIjpmYWxzZSwidWlkIjoxMjR9XSwibm9kZSI6ImNsYXVzZV9ub2RlX2lkIn0=
