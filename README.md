# Amazon Product Listing Assistant

## Introduction
A Flask app that summarises competing Amazon listings and generates search-aware product titles and descriptions using [SearchApi](https://www.searchapi.io/?utm_source=dev&utm_medium=ambassador&utm_campaign=blog.adnansiddiqi.me) and OpenRouter.

## Tutorial

Read the [complete walkthrough](https://blog.adnansiddiqi.me/amazon-competitor-analysis-tool-python-flask/?utm_source=github&utm_medium=referral&utm_campaign=amazon-product-listing-assistant) for building this Amazon competitor analysis tool with Python and Flask

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/kadnan/Amazon-Product-Listing-Assistant.git
cd Amazon-Product-Listing-Assistant
```

### 2. Create and activate a virtual environment

```bash
python -m venv .venv
```

**macOS / Linux:**

```bash
source .venv/bin/activate
```

**Windows:**

```powershell
.venv\Scripts\Activate.ps1
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure API keys

Get API keys from [SearchApi]([https://www.searchapi.io/](https://www.searchapi.io/?utm_source=dev&utm_medium=ambassador&utm_campaign=blog.adnansiddiqi.me)) and [OpenRouter](https://openrouter.ai/).

Create a `.env` file in the project root:

```env
SEARCHAPI_API_KEY=your-searchapi-key
OPENROUTER_API_KEY=your-openrouter-key
```

Add `.env` and your virtual environment to `.gitignore`:

```gitignore
.env
.venv/
```

The app loads these variables using `python-dotenv`, which should be included in `requirements.txt`.

### 5. Start the app

```bash
flask --app app run --debug
```

Open http://127.0.0.1:5000 in your browser.

> This command assumes the Flask entry file is `app.py`. Adjust `--app` if your filename differs.

## Usage

1. Enter your product name, price and specifications.
2. Choose an Amazon marketplace and search for similar products.
3. Select competitors and click **Compare & write**.
4. Review competitor feature summaries and edit the generated title and description.
5. Click **Regenerate** for alternative wording without fetching competitor listings again.

AI-generated content is a draft. Verify product facts before publishing.
