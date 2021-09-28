FROM nikolaik/python-nodejs:python3.9-nodejs16

RUN apt-get update && apt-get -y install --no-install-recommends sudo
RUN npm i -g typescript rimraf

ARG DEVELOPER_USER=developer
ARG DEVELOPER_GROUP=${DEVELOPER_USER}
ARG DEVELOPER_HOME=/home/${DEVELOPER_USER}

# Add non-root passwordless sudo user
RUN mkdir -p /etc/sudoers.d && \
    addgroup ${DEVELOPER_GROUP} && \
    adduser --disabled-password --gecos "" --home "${DEVELOPER_HOME}" --ingroup ${DEVELOPER_GROUP} ${DEVELOPER_USER} && \
    usermod -aG sudo ${DEVELOPER_USER} && \
    echo "${DEVELOPER_USER} ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/${DEVELOPER_USER} && \
    chmod 0440 /etc/sudoers.d/${DEVELOPER_USER}

# Create workdpace dir
ARG WORKSPACE_DIR=/workspaces/project
RUN sudo mkdir -p ${WORKSPACE_DIR} && \
    sudo chown ${DEVELOPER_USER}:${DEVELOPER_GROUP} ${WORKSPACE_DIR}

# Switch to default user
USER ${DEVELOPER_USER}
