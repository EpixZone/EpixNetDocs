# Installing EpixNet

## Quick Start

### Prerequisites

- Python 3.8 or higher
- Git (for cloning the repository)
- Basic development tools (compiler, etc.)

### Installation Steps

1. **Clone the repository**:

```bash
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet
```

2. **Create a virtual environment**:

```bash
python3 -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. **Install dependencies**:

```bash
python3 -m pip install -r requirements.txt
```

4. **Run EpixNet**:

```bash
python3 epixnet.py
```

5. **Access the dashboard**:

Open your browser and navigate to: `http://127.0.0.1:42222/`

## System Dependencies

### Ubuntu/Debian

```bash
sudo apt update
sudo apt install git pkg-config libffi-dev python3-pip python3-venv python3-dev build-essential libtool
```

### Fedora/CentOS/RHEL

```bash
# Fedora
sudo dnf install git python3-pip python3-wheel python3-devel gcc

# CentOS/RHEL
sudo yum install epel-release
sudo yum install git python3 python3-wheel python3-devel gcc
```

### openSUSE

```bash
sudo zypper install python3-pip python3-setuptools python3-wheel python3-devel gcc
```

### Arch Linux

```bash
sudo pacman -S git python-pip base-devel
```

### macOS

```bash
# Install Xcode command line tools
xcode-select --install

# Install Python 3 via Homebrew (recommended)
brew install python3
```

### Android (Termux)

```bash
# Install Termux from F-Droid or Google Play
pkg update
pkg install python automake git binutils libtool

# For older Android versions, you may also need:
pkg install openssl-tool libcrypt clang

# Optional: Install Tor for enhanced privacy
pkg install tor
```

## Docker Installation

### Using Docker Compose (Recommended)

```bash
# Clone the repository
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet

# Run with separate Tor container
docker compose up -d epixnet

# Or run with integrated Tor
docker compose up -d epixnet-tor
```

### Manual Docker Build

```bash
# Build standard image
docker build -t epixnet:latest . -f docker/Dockerfile

# Build with integrated Tor
docker build -t epixnet:latest . -f docker/tor.Dockerfile

# Run the container
docker run --rm -it \
  -v /path/to/data:/app/data \
  -p 42222:42222 \
  -p 42223:42223 \
  -p 10042:10042 \
  epixnet:latest
```

**Note**: Replace `/path/to/data` with your desired data directory. This directory will contain your sites and private keys.

## Automated Setup Script

```bash
# Use the provided setup script
./start-venv.sh
```

This script automatically:

- Creates a Python virtual environment
- Installs all dependencies
- Starts EpixNet

## Windows Installation

### Prerequisites

1. **Install Python 3.8+** from [python.org](https://www.python.org/downloads/)
2. **Install Git** from [git-scm.com](https://git-scm.com/downloads)
3. **Install Visual Studio Build Tools** (for compiling dependencies)

### Installation Steps

```cmd
# Clone the repository
git clone https://github.com/EpixZone/EpixNet.git
cd EpixNet

# Create virtual environment
python -m venv venv
venv\Scripts\activate

# Install dependencies
pip install -r requirements.txt

# Run EpixNet
python epixnet.py
```

### With Tor Support

```cmd
# Install Tor Browser or standalone Tor
# Run EpixNet with Tor proxy
python epixnet.py --tor_proxy 127.0.0.1:9150 --tor_controller 127.0.0.1:9151

# For full Tor anonymity
python epixnet.py --tor_proxy 127.0.0.1:9150 --tor_controller 127.0.0.1:9151 --tor always
```

## Configuration

### Command Line Options

```bash
# Basic usage
python3 epixnet.py

# Custom port
python3 epixnet.py --ui_port 42222

# Enable Tor
python3 epixnet.py --tor always

# Offline mode
python3 epixnet.py --offline

# Custom data directory
python3 epixnet.py --data_dir /path/to/data

# Debug mode
python3 epixnet.py --debug
```

### Configuration File

EpixNet creates an `epixnet.conf` file in your data directory where you can set persistent configuration options.


