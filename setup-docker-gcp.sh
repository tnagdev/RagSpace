#!/bin/bash
set -e

echo "======================================"
echo "Docker Cleanup & Installation for GCP VM"
echo "======================================"

# Remove old Docker installations
echo "Cleaning up old Docker installations..."
sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null || true
sudo apt-get autoremove -y
sudo apt-get autoclean

# Remove old Docker data (optional - uncomment if you want a complete wipe)
# sudo rm -rf /var/lib/docker
# sudo rm -rf /var/lib/containerd

echo "Updating package index..."
sudo apt-get update

# Install prerequisites
echo "Installing prerequisites..."
sudo apt-get install -y \
    ca-certificates \
    curl \
    gnupg \
    lsb-release

# Add Docker's official GPG key
echo "Adding Docker GPG key..."
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

# Set up the repository
echo "Setting up Docker repository..."
echo \
  "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu \
  $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

# Update package index with Docker packages
sudo apt-get update

# Install Docker Engine
echo "Installing Docker Engine..."
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

# Start Docker service
echo "Starting Docker service..."
sudo systemctl start docker
sudo systemctl enable docker

# Add current user to docker group (to run without sudo)
echo "Adding $USER to docker group..."
sudo usermod -aG docker $USER

# Verify installation
echo ""
echo "======================================"
echo "Docker installation complete!"
echo "======================================"
sudo docker --version
sudo docker compose version

echo ""
echo "⚠️  CRITICAL: You MUST restart your SSH session for changes to take effect"
echo ""
echo "Run these commands now:"
echo "  exit                    # Close current SSH session"
echo "  ssh user@your-vm-ip    # Reconnect"
echo "  docker --version       # Test without sudo"
echo ""
echo "If 'docker' command not found after reconnect, run:"
echo "  source ~/.bashrc       # Reload shell config"
echo "  newgrp docker          # Or activate docker group"
echo ""
echo "Test installation with: docker run hello-world"
