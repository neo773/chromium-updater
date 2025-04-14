#!/usr/bin/env node

import EasyDl from "easydl"
import cliProgress from "cli-progress"
import { execa } from "execa"
import { createSpinner } from "nanospinner"
import { existsSync } from "fs"
import { join } from "path"
import { type GitHubResponse } from "./types"

const spinner = createSpinner("Checking for updates").start()

const getArchitecture = (): string => {
  const arch = process.arch
  return arch === "arm64" ? "arm64" : "x86_64"
}

const downloadAndInstallDMG = async (
  url: string,
  outputPath: string
) => {
  const progressBar = new cliProgress.SingleBar({
    format: "Downloading [{bar}] {percentage}% | ETA: {eta}s | {value}/{total}",
  })
  progressBar.start(100, 0)

  const downloadInstance = new EasyDl(url, outputPath, {
    existBehavior: "overwrite",
  })

  await downloadInstance
    .on("progress", ({ total }) => {
      progressBar.update(Number(total.percentage.toFixed(0)))
    })
    .wait()

  progressBar.stop()

  try {
    // Kill Chromium if it's running
    await execa("killall", ["Chromium"]).catch(() => {})
    
    // Wait a moment to ensure the process is properly terminated
    await new Promise(resolve => setTimeout(resolve, 1000))
    
    // Mount the DMG
    const { stdout: mountPoint } = await execa("hdiutil", ["attach", outputPath, "-nobrowse", "-noautoopen"])
    const volumePath = mountPoint.split("\t").pop()?.trim() || ""
    
    if (!volumePath) {
      throw new Error("Failed to mount DMG file")
    }
    
    // Remove existing Chromium app
    if (existsSync("/Applications/Chromium.app")) {
      await execa("rm", ["-rf", "/Applications/Chromium.app"])
    }
    
    // Copy Chromium app from mounted DMG to Applications
    const appPath = join(volumePath, "Chromium.app")
    await execa("cp", ["-R", appPath, "/Applications/"])
    
    // Detach the DMG
    await execa("hdiutil", ["detach", volumePath, "-force"])
    
    // Remove the downloaded DMG file
    await execa("rm", ["-f", outputPath])
  } catch (error) {
    console.error("Error during installation:", error)
    throw error
  }
}

const getLocalChromiumVersion = async (): Promise<string> => {
  try {
    const { stdout } = await execa(
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      ["--version"]
    )
    return stdout.trim().split(" ")[1]
  } catch (error) {
    // Chromium might not be installed yet
    return ""
  }
}

export const updateChromium = async () => {
  try {
    const apiUrl = "https://api.github.com/repos/ungoogled-software/ungoogled-chromium-macos/releases"
    const response = await fetch(apiUrl)
    
    if (!response.ok) {
      throw new Error(`GitHub API error: ${response.status} ${response.statusText}`)
    }
    
    const releases: GitHubResponse[] = await response.json()
    const latestRelease = releases[0]
    
    const arch = getArchitecture()
    const dmgPattern = new RegExp(`ungoogled-chromium_.*_${arch}-macos\\.dmg$`)
    
    const asset = latestRelease.assets.find((asset) =>
      dmgPattern.test(asset.browser_download_url)
    )
    
    if (!asset) {
      throw new Error(`No DMG file found for architecture: ${arch}`)
    }

    const localVersion = await getLocalChromiumVersion()
    const remoteVersion = latestRelease.tag_name.match(/(\d+\.\d+\.\d+\.\d+)/)?.[0] || ""
    
    if (!remoteVersion) {
      throw new Error("Failed to parse remote version")
    }

    if (localVersion && localVersion === remoteVersion) {
      spinner.success({
        text: `Chromium is already up-to-date (v${localVersion}).`,
      })
      process.exit(0)
    } else {
      
      spinner.success({
        text: `Found update: v${remoteVersion}${localVersion ? ` (current: v${localVersion})` : ""}`,
      })
      
      const url = asset.browser_download_url
      const outputPath = "/tmp/chromium.dmg"
      
      await downloadAndInstallDMG(url, outputPath)

      spinner.success({
        text: `Chromium updated to v${remoteVersion} successfully`,
      })
      process.exit(0)
    }
  } catch (error) {
    spinner.error({
      text: `Error: ${error instanceof Error ? error.message : String(error)}`,
    })
    process.exit(1)
  }
}

updateChromium()
