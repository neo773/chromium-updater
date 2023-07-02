#!/usr/bin/env node

import EasyDl from "easydl"
import cliProgress from "cli-progress"
import { execa } from "execa"
import { createSpinner } from "nanospinner"
import { type GitHubResponse } from "./types"

const spinner = createSpinner("Checking for updates").start()

const isRunningAsRoot = (): boolean => {
  return process.getuid! && process.getuid() === 0
}

const downloadAndExtract = async (
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
    await execa("killall Chromium")
  } catch (error) {}
  
  await execa("tar", ["-xJf", outputPath, "-C", "/Applications"])
}

const getLocalChromiumVersion = async (): Promise<string> => {
  const { stdout } = await execa(
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    ["--version"]
  )
  return stdout.trim().split(" ")[1]
}

export const updateChromium = async () => {
  try {
    const apiUrl = "https://api.github.com/repos/macchrome/macstable/releases"
    const response = await fetch(apiUrl)
    const releases: GitHubResponse[] = await response.json()
    const latestRelease = releases[0]

    const asset = latestRelease.assets.find((asset) =>
      asset.browser_download_url.includes(".tar.xz")
    )

    const localVersion = await getLocalChromiumVersion()
    const remoteVersion =
      latestRelease.tag_name.match(/(\d+\.\d+\.\d+\.\d+)/)?.[0]

    if (localVersion === remoteVersion) {
      spinner.success({
        text: "Chromium is already up-to-date.",
      })
      process.exit()
    } else {
      if (!isRunningAsRoot()) {
        return spinner.error({
          text: `Run the script as su`,
        })
      }
      spinner.reset()
      process.stdout.write("\x1Bc")
      console.log(`Found update v${remoteVersion}`)
      const url = asset?.browser_download_url!
      const outputPath = "/tmp/chromium.tar.xz"
      await downloadAndExtract(url, outputPath)

      return spinner.success({
        text: `Chromium updated to ${remoteVersion} successfully`,
      })
    }
  } catch (error) {
    return spinner.error({
      text: error,
    })
  }
}

updateChromium()
