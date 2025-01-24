#!/usr/bin/env node

if(require("node:fs").existsSync("/data/cronicle/users") || process.env["IS_WORKER"] === "true") {
  console.log("Docker Env already configured.");
  require("../lib/main.js");
} else {
  const { existsSync, unlinkSync, mkdirSync } = require("node:fs");
  const { dirname } = require("node:path");
  const { spawnSync } = require("node:child_process");
  const { hostname, networkInterfaces } = require("node:os");
  const StandaloneStorage = require("pixl-server-storage/standalone");

  if (existsSync("./logs/cronicled.pid")) unlinkSync("./logs/cronicled.pid");

  // Ensure the storage directory exists
  if (!existsSync("/data/cronicle")) {
    mkdirSync("/data/cronicle", { recursive: true });
  }

  if (!existsSync("/data/cronicle/users")) {
    console.log("Storage init.");
    const result = spawnSync("/opt/cronicle/bin/control.sh", ["setup"]);
    if (result.error || result.stderr.length !== 0) {
      console.log("init storage failed");
      console.log(result.error?.message || result.stderr.toString());
      process.exit(1);
    }
    console.log(`stdout: ${result.stdout}`);
  }

  process.chdir(dirname(__dirname));

  const config = require("../conf/config.json");
  const storage = new StandaloneStorage(config.Storage, (err) => {
    if (err) throw err;
    const dockerHostName = (process.env["HOSTNAME"] || process.env["HOST"] || hostname()).toLowerCase();

    const networks = networkInterfaces();
    const [ip] = Object.keys(networks)
      .filter((eth) => networks[eth].filter((addr) => addr.internal === false && addr.family === "IPv4").length)
      .map((eth) => networks[eth])[0];

    const data = {
      type: "list_page",
      items: [{ hostname: dockerHostName, ip: ip.address }],
    };

    const key = "global/servers/0";
    storage.put(key, data, () => {
      storage.shutdown(() => {
        console.log(`Record successfully saved: ${key}\n`);
        storage.get(key, (_, data) => {
          if (storage.isBinaryKey(key)) {
            console.log(`${data.toString()}\n`);
          } else {
            console.log(`${typeof data === "object" ? JSON.stringify(data, null, "\t") : data}\n`);
          }
          storage.shutdown(() => {
            console.log("Docker Env Fixed.");
            require("../lib/main.js");
          });
        });
      });
    });
  });
}