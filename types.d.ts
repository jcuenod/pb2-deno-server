import { QueryObjectResult } from "https://deno.land/x/postgres@v0.8.0/query/query.ts";

type QueryFunction = (query: string) => QueryFunctionResult;
type QueryFunctionResult = Promise<QueryObjectResult<Record<string, unknown>>>;
