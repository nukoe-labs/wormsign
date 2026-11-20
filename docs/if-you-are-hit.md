# If wormsign found a worm in your account

This guide is for anyone whose GitHub account, organization or repository shows a **critical** or **high** finding.
It follows the order that protects your files: some worms punish the victim when their stolen token is revoked.

## Why the order matters

The Miasma worm installs a *wiper*, a program that deletes your home folder as soon as the stolen GitHub token stops
working. Revoking the token first, from the infected computer, can therefore destroy your files. Clean the computer
first, then revoke from another computer.

## 1. Stop the spread (5 minutes)

1. Disconnect the infected computer from the network (Wi-Fi and cable).
2. Copy your work to an external disk. Do not copy configuration folders (`~/.config`, `~/.claude`, `~/.cursor`).

## 2. Look for the worm on the computer

The worm lives on the computer that ran it, not only in GitHub. Look for:

- the files `~/.config/index.js`, `~/.local/share/runtimes/sync.py`, `~/.config/net-health-checker/`,
  `/var/tmp/.fontconfig_state`, `/tmp/.bun_ran`, `~/.claude/package/`, `~/.codex/package/`;
- background services named `pkg-runtime` or `net-health-checker`
  (`systemctl --user list-units` on Linux, `ls ~/Library/LaunchAgents` on macOS);
- unknown hooks in your **global** agent settings, such as `~/.claude/settings.json`.

If one of them exists, reinstall the computer. Cleaning by hand often leaves a way back in.

## 3. Revoke everything, from a clean computer

- GitHub: personal access tokens (https://github.com/settings/tokens), SSH keys, sessions, OAuth and GitHub Apps;
  run `gh auth logout` on every computer.
- Package registries: npm, PyPI, RubyGems, Docker Hub.
- Cloud keys (AWS, Google Cloud, Azure), AI API keys, and the secrets kept in `.env` files.
- Your password manager, if its vault was open on the infected computer.

## 4. Clean the repositories

1. Run `pnpm dlx github:nukoe-labs/wormsign <your-account>` (or `npx github:nukoe-labs/wormsign <your-account>`) again and list every repository
   **and every branch** it reports. Worms arm feature branches too; a branch that nobody uses is still cloned by others.
2. Remove the files with a normal commit on each branch. Do not rewrite history before step 3 is done.
3. Delete the exfiltration repositories (random names such as `smart-workers-48213`, description `project-utils`,
   `Sha1-Hulud: The Second Coming.` or `Shai-Hulud: Here We Go Again`): they hold your stolen secrets, encrypted
   or not.
4. Read your security log (https://github.com/settings/security-log) for pushes, new tokens or new repositories that
   you did not make, and check the packages published under your name.
5. Tell the people who may have cloned the repository.

## 5. Check that it does not come back

Re-infection is common: one owner who cleaned a repository was armed again a few days later, because the token was
still valid. Add the [GitHub Action](../README.md#github-action) to scan your account every day for a month.

## Glossary

- **Token**: a password for programs, used by `git` and `gh` to act as you on GitHub.
- **Hook**: a command that an AI coding agent (Claude Code, Gemini CLI, Cursor) runs by itself at a given moment,
  for example when a session starts.
- **MCP server**: a local program that an agent starts to get new tools (MCP means Model Context Protocol).
- **Exfiltration repository**: a repository created by the worm, under your name, to publish what it stole.
- **Wiper**: a program whose only goal is to delete data.

## Sources

- Bitdefender Labs: https://www.bitdefender.com/en-us/blog/labs/how-ai-agents-become-new-targets-in-github-malware-campaign
- SafeDep, Miasma variant: https://safedep.io/testmetest-npm-worm-miasma-variant/
- SafeDep, Mini Shai-Hulud: https://safedep.io/mini-shai-hulud-strikes-again-314-npm-packages-compromised/
- Wiz, Shai-Hulud 2.0: https://www.wiz.io/blog/shai-hulud-2-0-ongoing-supply-chain-attack
