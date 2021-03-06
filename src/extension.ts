'use strict';
// The module 'vscode' contains the VS Code extensibility API
import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';

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


/**
 * Wrap the command with to export with common boilplate functionality:
 * - report exceptions as log message, instead of consuming them silently
 * - initialize global ChromiumTestManager with known information
 *
 * @param command the command to be registered to extension context
 */
function exportCommand(command: () => void): () => void {
  return wrapException(() => {
    initChromiumTestManager();
    command();
  });
}

/**
 * A decorator that bounds all errors generated by this extension to custom
 * output pipe.
 *
 * @param f raw registered command
 */
function wrapException(f: () => void): () => void {
  return () => {
    try { return f(); } catch (e) {
      log(`vscode-chromium-test error: ${e}`);
    }
  };
}

/**
 * This function initializes global instance of |ChromiumTestManager.self|.
 *
 * @throws string when the current vscode opened folders do not contain a
 * chromium checkout
 */
function initChromiumTestManager(): void {
  if (vscode.workspace.rootPath === undefined)
    throw "No opened folder. Please open a folder that contains chromium checkout.";

  // Verify chromium checkout by checking src/LICENSE.chromium_os.
  if (!fs.existsSync(path.join(vscode.workspace.rootPath, 'src', 'LICENSE.chromium_os')))
    throw "Current project is not a chromium checkout.";

  // TODO(chenleihu): wire compile target selection here.
  ChromiumTestManager.self = new ChromiumTestManager(path.join(vscode.workspace.rootPath, 'src'));
}

class ChromiumTestManager {
  public static self: ChromiumTestManager | undefined = undefined;

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

  /**
   * Get test command based on current workspace state.
   *
   * Potentially running:
   * - web tests
   * - browser tests
   * - cpp unit tests
   */
  public getTestCommand(): string {
    return this.getCompileCommand("content_shell") + " && " +
      this.getWebTestCommand(getCurrentFilePath());
  }
}

export function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(vscode.commands.registerCommand(
    'chromium.copyWebTestCommand', exportCommand(() => {
      pasteToClipboard(ChromiumTestManager.self.getTestCommand());
    })));

  context.subscriptions.push(vscode.commands.registerCommand(
    'chromium.runWebTest', exportCommand(() => {
      runCommand(ChromiumTestManager.self.getTestCommand());
    })));
}

// this method is called when your extension is deactivated
export function deactivate() {
}
