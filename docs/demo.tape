# This tape records the README animation with vhs (https://github.com/charmbracelet/vhs): vhs docs/demo.tape
# Large text and about 100 columns keep the GIF sharp once GitHub shrinks it to the page width.
Output docs/demo.gif
Set Shell "bash"
Set FontSize 22
Set Width 1500
Set Height 740
Set Padding 30
Set LineHeight 1.3
Set Theme "GitHub Dark"
Set TypingSpeed 35ms
Set Framerate 24
Set WaitTimeout 90s
Hide
Type `alias wormsign="script -q /dev/null node $PWD/dist/cli.js </dev/null"; export GITHUB_TOKEN=$(gh auth token); say() { printf "\033[1A\033[2K\n\033[1;38;2;121;192;255m%s\033[0m\n" "$*"; }; s1() { say "1. Scan any GitHub account or repository. Nothing is cloned, nothing is run."; }; s2() { say "2. Each line is one worm sign, with the file it hides in. Here: 8 signs in 1 repository."; }; s3() { say "3. Worm signs give exit code 1, so the same command fails your CI."; }; export PS1="\[\033[1;32m\]$\[\033[0m\] " && clear`
Enter
Type "s1"
Enter
Show
Sleep 2.5s
Type "wormsign ConcordiaDev/theme_saimaniq | grep -E 'WS0|wormsign:'"
Enter
Wait+Screen@90s /wormsign: 1 of 1/
Sleep 1.5s
Hide
Type "s2"
Enter
Show
Sleep 4s
Hide
Type "s3"
Enter
Show
Sleep 1.5s
Type `wormsign ConcordiaDev/theme_saimaniq >/dev/null; echo "exit code: $?"`
Enter
Wait+Screen@90s /exit code: 1/
Sleep 1.5s
