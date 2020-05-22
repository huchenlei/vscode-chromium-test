'use strict';
// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as path from 'path';

/**
 * Get the full file path of current file in text editor.
 *
 * @throws string: when |vscode.window.activeTextEditor| is undefined
 */
function getCurrentFilePath(): string {
  const editor = vscode.window.activeTextEditor;
  if (!editor)
    throw "No active editor";
  return editor.document.fileName;
}

function pasteToClipboard(input: string) {
  vscode.env.clipboard.writeText(input);
  vscode.window.setStatusBarMessage(`"${input}" was copied to the clipboard.`, 3000);
}

function log(message: string): void {
  vscode.window.showInformationMessage(message);
}

function isChromiumDir(file_path: string): boolean {
  return false;
}

function isWebPlatformTest(file_path: string): boolean {
  return false;
}

class ChromiumTestManager {
  rootDir: string;
  compileTarget: string;

  public constructor (
    rootDir: string,
    compileTarget: string = "Default"
  ) {
    this.rootDir = rootDir;
    this.compileTarget = compileTarget;
  }

  public getCompileCommand(target_binary: string) {
    return `autoninja -C out/${this.compileTarget} ${target_binary}`;
  }

  /**
   * Get a command that can be used to execute the web tests
   * under third_party/blink/web_tests/ dir
   *
   * @param file_path full path to test file
   * @returns bash command that can execute test file
   * @throws string when test file has invalid file extension
   */
  public getWebTestCommand(file_path: string): string {
    if (!['html', 'php'].includes(path.extname(file_path)))
      throw `Wrong extension(${path.extname(file_path)}) for web test. Expect .html or .php.`;

    const web_test_path = [this.rootDir, "third_party", "blink", "web_tests"].join(path.sep);
    const test_script_path = ["third_party", "blink", "tools", "run_web_tests.py"].join(path.sep);
    const test_path = path.relative(web_test_path, file_path);
    return `${test_script_path} -t ${this.compileTarget} ${test_path}`;
  }

  public getBrowserTestCommand(file_path: string): string {
    return "";
  }
}

export function activate(context: vscode.ExtensionContext) {
  const workspaceUri = (vscode.workspace.workspaceFolders !== undefined) ? vscode.workspace.workspaceFolders[0].uri : undefined;
  const configuration = vscode.workspace.getConfiguration('chromium', workspaceUri);

  let chromiumDir = configuration.get<string>("chromium.rootDir");
  let chromiumTargetConfig = configuration.get<string>("chromium.targetConfig");

  if (chromiumDir === undefined) {
    log("chromium.rootDir not configed in config.json");
    chromiumDir = "chromium/src";
  }

  chromiumDir = path.resolve(chromiumDir);

  if (chromiumTargetConfig === undefined) {
    log("chromium.targetConfig not configed in config.json");
    chromiumTargetConfig = "Default";
  }

  const testManager = new ChromiumTestManager(chromiumDir, chromiumTargetConfig);

  context.subscriptions.push(vscode.commands.registerCommand(
    'chromium.copyWebTestCommand', () => {
      try {
        const command = testManager.getCompileCommand("content_shell") + " && " +
          testManager.getWebTestCommand(getCurrentFilePath());
        pasteToClipboard(command);
        vscode.window.showInformationMessage(command);
      } catch (e) {
        log(`vscode-chromium-test: ${e}`);
      }
    }));
}

// this method is called when your extension is deactivated
export function deactivate() {
}
