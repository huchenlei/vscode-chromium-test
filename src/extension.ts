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


function getTerminal(): vscode.Terminal {
  if (vscode.window.terminals.length == 0) {
    const terminal = vscode.window.createTerminal();
    terminal.sendText("cd src\n");
    return terminal;
  } else {
    return vscode.window.terminals[0];
  }
}

/**
 * Note: if there is existing text in terminal buffer, the command will be
 * directly append to existing content, which might result in unwanted behaviour.
 *
 * @param command command to be run in terminal
 */
function runCommand(command: string) {
  const terminal = getTerminal();
  terminal.show();
  terminal.sendText(command + "\n");
}

function log(message: string): void {
  vscode.window.showInformationMessage(message);
}

class ChromiumTestManager {
  rootDir: string;
  compileTarget: string;

  public constructor(
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
   * under third_party/blink/web_tests/ dir.
   *
   * @param file_path full path to test file
   * @returns bash command that can execute test file
   * @throws string when test file has invalid file extension
   */
  public getWebTestCommand(file_path: string): string {
    if (!['.html', '.php'].includes(path.extname(file_path)))
      throw `Wrong extension(${path.extname(file_path)}) for web test. Expect .html or .php.`;

    const web_test_path = path.join(this.rootDir, "third_party", "blink", "web_tests");
    const test_script_path = path.join("third_party", "blink", "tools", "run_web_tests.py");
    const test_path = path.relative(web_test_path, file_path);
    return `${test_script_path} -t ${this.compileTarget} ${test_path}`;
  }

  /**
   * Get a command that can be used to execute the cpp test with current
   * chromium compile target.
   *
   * @param test_executable name of test executable, e.g. blink_unittests
   * @param test_name full test name to run, e.g. DocumentLoaderSimTest.*
   */
  public getCppTestCommand(test_executable: string, test_name: string): string {
    const absolate_executable_path =
      path.join(this.rootDir, 'out', this.compileTarget, test_executable);

    return `${absolate_executable_path} --gtest_filter=${test_name}`;
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
  function getTestCommand() {
    return testManager.getCompileCommand("content_shell") + " && " +
      testManager.getWebTestCommand(getCurrentFilePath());
  }

  function wrap_exception(f: () => void): () => void {
    return () => {
      try {
        f();
      } catch (e) {
        log(`vscode-chromium-test: ${e}`);
      }
    };
  }

  context.subscriptions.push(vscode.commands.registerCommand(
    'chromium.copyWebTestCommand', wrap_exception(() => {
      pasteToClipboard(getTestCommand());
    })));

  context.subscriptions.push(vscode.commands.registerCommand(
    'chromium.runWebTest', wrap_exception(() => {
      runCommand(getTestCommand());
    })));
}

// this method is called when your extension is deactivated
export function deactivate() {
}
