#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateChromium = void 0;
const easydl_1 = __importDefault(require("easydl"));
const cli_progress_1 = __importDefault(require("cli-progress"));
const execa_1 = require("execa");
const nanospinner_1 = require("nanospinner");
const spinner = (0, nanospinner_1.createSpinner)("Checking for updates").start();
const isRunningAsRoot = () => {
    return process.getuid && process.getuid() === 0;
};
const downloadAndExtract = async (url, outputPath) => {
    const progressBar = new cli_progress_1.default.SingleBar({
        format: "Downloading [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
    });
    progressBar.start(100, 0);
    const downloadInstance = new easydl_1.default(url, outputPath, {
        existBehavior: "overwrite",
    });
    await downloadInstance
        .on("progress", ({ total }) => {
        progressBar.update(Number(total.percentage.toFixed(0)));
    })
        .wait();
    progressBar.stop();
    await (0, execa_1.execa)("tar", ["-xJf", outputPath, "-C", "/Applications"]);
};
const getLocalChromiumVersion = async () => {
    const { stdout } = await (0, execa_1.execa)("/Applications/Chromium.app/Contents/MacOS/Chromium", ["--version"]);
    return stdout.trim().split(" ")[1];
};
const updateChromium = async () => {
    try {
        const apiUrl = "https://api.github.com/repos/macchrome/macstable/releases";
        const response = await fetch(apiUrl);
        const releases = await response.json();
        const latestRelease = releases[0];
        const asset = latestRelease.assets.find((asset) => asset.browser_download_url.includes(".tar.xz"));
        const localVersion = await getLocalChromiumVersion();
        const remoteVersion = latestRelease.tag_name.match(/(\d+\.\d+\.\d+\.\d+)/)?.[0];
        if (localVersion === remoteVersion) {
            spinner.success({
                text: "Chromium is already up-to-date.",
            });
            process.exit();
        }
        else {
            if (!isRunningAsRoot()) {
                return spinner.error({
                    text: `Run the script as su`,
                });
            }
            spinner.reset();
            process.stdout.write("\x1Bc");
            console.log(`Found update v${remoteVersion}`);
            const url = asset?.browser_download_url;
            const outputPath = "/tmp/chromium.tar.xz";
            await downloadAndExtract(url, outputPath);
            return spinner.success({
                text: `Chromium updated to ${remoteVersion} successfully`,
            });
        }
    }
    catch (error) {
        return spinner.error({
            text: error,
        });
    }
};
exports.updateChromium = updateChromium;
(0, exports.updateChromium)();
