# syntax=docker/dockerfile:1.7
# The student's workstation: what runs behind the browser terminal.
#
#   docker build -t cka-lab/toolbox:dev images/toolbox
#
# One image, two containers per lab session (see apps/ms-labs):
#   - `shell`   — the student's interactive bash (the browser terminal)
#   - `checker` — runs lab setup and checks; the student cannot touch its filesystem
#
# Tool versions follow the exam: kubectl matches the virtual cluster's
# Kubernetes minor version.

ARG ALPINE_IMAGE=alpine:3.22

FROM ${ALPINE_IMAGE} AS tools
ARG TARGETARCH
ARG KUBECTL_VERSION=v1.36.6
ARG HELM_VERSION=v4.3.1
ARG YQ_VERSION=v4.47.2
RUN apk add --no-cache curl tar \
 && curl -fsSLo /usr/local/bin/kubectl "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" \
 && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar -xz -C /tmp \
 && mv "/tmp/linux-${TARGETARCH}/helm" /usr/local/bin/helm \
 && curl -fsSLo /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${TARGETARCH}" \
 && chmod 0755 /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/yq

FROM ${ALPINE_IMAGE}
RUN apk add --no-cache bash bash-completion coreutils curl jq vim nano less ncurses openssl \
      bind-tools iputils-ping netcat-openbsd procps grep sed gawk diffutils tar gzip \
 && adduser -D -u 1000 -h /home/student -s /bin/bash student
COPY --from=tools /usr/local/bin/ /usr/local/bin/
COPY bashrc /etc/cka/bashrc
COPY vimrc /etc/vim/vimrc.local
COPY motd /etc/cka/motd
COPY start-shell.sh /usr/local/bin/start-shell
RUN chmod 0755 /usr/local/bin/start-shell \
 && kubectl completion bash > /usr/share/bash-completion/completions/kubectl \
 && helm completion bash > /usr/share/bash-completion/completions/helm

# The home directory is an emptyDir in the Pod, so files and shell history
# survive reconnects (but not a lab reset). The root filesystem is read-only.
ENV HOME=/home/student \
    KUBECONFIG=/etc/cka/kube/config \
    TERM=xterm-256color \
    EDITOR=vim
USER 1000:1000
WORKDIR /home/student
CMD ["sleep", "infinity"]
