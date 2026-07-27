import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { createServer } from "node:http";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const contentTypes = new Map([
  [".css", "text/css; charset=utf-8"],
  [".html", "text/html; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"]
]);

export function createStaticServer(rootDirectory = process.cwd()) {
  const root = path.resolve(rootDirectory);
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://localhost");
      const relativePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
      const filePath = path.resolve(root, `.${relativePath}`);
      if (filePath !== root && !filePath.startsWith(`${root}${path.sep}`)) {
        response.writeHead(403).end("Forbidden");
        return;
      }

      const fileStats = await stat(filePath);
      if (!fileStats.isFile()) {
        response.writeHead(404).end("Not found");
        return;
      }

      response.writeHead(200, {
        "Cache-Control": "no-store",
        "Content-Type": contentTypes.get(path.extname(filePath)) || "application/octet-stream"
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404).end("Not found");
    }
  });
}

function openInDefaultBrowser(url) {
  const commands = {
    win32: ["rundll32.exe", ["url.dll,FileProtocolHandler", url]],
    darwin: ["open", [url]]
  };
  const [command, args] = commands[process.platform] || ["xdg-open", [url]];
  const opener = spawn(command, args, {
    detached: true,
    stdio: "ignore",
    windowsHide: true
  });
  opener.unref();
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : "";
if (import.meta.url === entryPath) {
  const port = Number(process.env.PORT) || 4173;
  const server = createStaticServer(path.resolve(fileURLToPath(new URL("..", import.meta.url))));
  server.listen(port, "127.0.0.1", () => {
    const url = `http://127.0.0.1:${port}`;
    console.log(`Simulator: ${url}`);
    if (process.argv.includes("--open")) openInDefaultBrowser(url);
  });
}
