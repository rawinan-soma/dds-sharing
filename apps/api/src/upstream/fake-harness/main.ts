import {
  FAKE_UPSTREAM_SCENARIOS,
  startFakeUpstreamServer,
} from "./fake-upstream-server.js";

const port = process.env.FAKE_UPSTREAM_PORT
  ? Number(process.env.FAKE_UPSTREAM_PORT)
  : 4010;
const handle = await startFakeUpstreamServer({ port });

console.log(`Fake upstream harness listening on ${handle.url}`);
console.log(
  `Point UPSTREAM_BASE_URL at it in your local .env: UPSTREAM_BASE_URL=${handle.url}`,
);
console.log("Reserved group_code scenarios:", FAKE_UPSTREAM_SCENARIOS);
console.log("Any other group_code returns a two-page happy-path fixture.");
console.log("Ctrl+C to stop.");

process.on("SIGINT", async () => {
  await handle.close();
  process.exit(0);
});
