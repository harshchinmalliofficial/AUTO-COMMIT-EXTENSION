const vscode = require("vscode");
const { Octokit } = require("@octokit/rest");
const simpleGit = require("simple-git");
const path = require("path");
const fs = require("fs");

let intervalId;

async function activate(context) {
  const startCommand = vscode.commands.registerCommand(
    "github-auto-commit.start",
    async () => {
      try {
        // Get GitHub token
        const token = await vscode.window.showInputBox({
          prompt: "Enter your GitHub Personal Access Token",
          password: true,
        });

        if (!token) {
          vscode.window.showErrorMessage("GitHub token is required!");
          return;
        }

        console.log("Token received successfully");

        // Get repository name
        const repoName = await vscode.window.showInputBox({
          prompt: "Enter repository name",
          validateInput: (text) => {
            return /^[a-zA-Z0-9-_]+$/.test(text)
              ? null
              : "Repository name can only contain letters, numbers, hyphens, and underscores";
          },
        });

        if (!repoName) {
          vscode.window.showErrorMessage("Repository name is required!");
          return;
        }

        console.log("Repository name received:", repoName);

        const octokit = new Octokit({ auth: token });
        const workspacePath = vscode.workspace.workspaceFolders?.[0].uri.fsPath;

        if (!workspacePath) {
          vscode.window.showErrorMessage(
            "Please open a workspace folder first!"
          );
          return;
        }

        console.log("Workspace path:", workspacePath);

        // Get user info first to verify token
        const { data: userData } = await octokit.users.getAuthenticated();
        console.log("Authenticated as:", userData.login);

        // Check if repository already exists
        try {
          const { data: repoData } = await octokit.repos.get({
            owner: userData.login,
            repo: repoName,
          });
          console.log("Repository already exists:", repoData.name);
        } catch (err) {
          if (err.status === 404) {
            // Repository doesn't exist, create it
            console.log("Creating repository:", repoName);
            await octokit.repos.createForAuthenticatedUser({
              name: repoName,
              auto_init: true,
            });
            console.log("Repository created successfully");
          } else {
            throw err;
          }
        }

        // Fetch repository details
        const { data: repoData } = await octokit.repos.get({
          owner: userData.login,
          repo: repoName,
        });

        const defaultBranch = repoData.default_branch;
        console.log("Default branch:", defaultBranch);

        // Clear the directory if it exists
        const repoPath = path.join(workspacePath, repoName);
        if (fs.existsSync(repoPath)) {
          fs.rmSync(repoPath, { recursive: true, force: true });
        }

        // Clone repository
        const git = simpleGit();
        const repoUrl = `https://github.com/${userData.login}/${repoName}.git`;
        console.log("Cloning from:", repoUrl);
        await git.clone(repoUrl, repoPath);
        console.log("Repository cloned successfully");

        // Change working directory to the cloned repo
        process.chdir(repoPath);

        // Start auto-commit interval
        intervalId = setInterval(async () => {
          try {
            const timestamp = new Date().toISOString();
            const readmePath = path.join(repoPath, "README.md");

            console.log("Updating README at:", readmePath);
            fs.appendFileSync(
              readmePath,
              `# ${repoName}\nLast updated: ${timestamp}\n\nThis repository is automatically updated every minute.`
            );

            const git = simpleGit(repoPath);
            await git
              .add(".")
              .commit(`Auto-update: ${timestamp}`)
              .push("origin", defaultBranch);

            console.log("Changes pushed successfully");
            vscode.window.showInformationMessage(
              "Successfully pushed changes!"
            );
          } catch (error) {
            console.error("Error in auto-commit interval:", error);
            vscode.window.showErrorMessage(
              `Error updating repository: ${error.message}`
            );
          }
        }, 60000); // 1 minute interval

        vscode.window.showInformationMessage(
          "Auto-commit started successfully!"
        );
      } catch (error) {
        console.error("Error in extension:", error);
        vscode.window.showErrorMessage(`Error: ${error.message}`);
      }
    }
  );

  const stopCommand = vscode.commands.registerCommand(
    "github-auto-commit.stop",
    () => {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = undefined;
        vscode.window.showInformationMessage("Auto-commit stopped!");
      }
    }
  );

  context.subscriptions.push(startCommand, stopCommand);
}

function deactivate() {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

module.exports = {
  activate,
  deactivate,
};
