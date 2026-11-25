#!/bin/bash
# Entry point of every browser terminal (exec'd by ms-labs with a TTY).
# Prints the welcome message once per session, then an interactive bash.
if [ ! -f "$HOME/.motd-shown" ]; then
  cat /etc/cka/motd
  : > "$HOME/.motd-shown"
fi
cd "$HOME" || exit 1
exec bash --rcfile /etc/cka/bashrc -i
