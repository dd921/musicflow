# GitHub Repository Setup Instructions

Your code has been committed locally. Follow these steps to push to GitHub:

## Step 1: Create GitHub Repository

1. Go to [github.com](https://github.com) and sign in
2. Click the "+" icon in the top right → "New repository"
3. Fill in:
   - **Repository name**: `musicflow` (or your preferred name)
   - **Description**: "Visualize Strava workouts with Spotify track overlays"
   - **Visibility**: Choose Public or Private
   - **DO NOT** initialize with README, .gitignore, or license (we already have these)
4. Click "Create repository"

## Step 2: Push Your Code

After creating the repository, GitHub will show you commands. Use these:

```bash
cd /Users/dandeangelis/projects/musicflow

# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin https://github.com/YOUR_USERNAME/musicflow.git

# Push to GitHub
git push -u origin main
```

## Alternative: Using SSH (if you have SSH keys set up)

```bash
# Add the remote (replace YOUR_USERNAME with your GitHub username)
git remote add origin git@github.com:YOUR_USERNAME/musicflow.git

# Push to GitHub
git push -u origin main
```

## What's Included

✅ All source code files
✅ Templates and static files
✅ README and documentation
✅ .gitignore (excludes .env, database files, etc.)

## What's Excluded (by .gitignore)

❌ `.env` file (contains your API keys - keep this private!)
❌ Database files (`*.db`, `*.sqlite`)
❌ Python cache files (`__pycache__/`)
❌ Virtual environments

## Next Steps After Pushing

1. **Add a .env.example file** (optional but recommended):
   ```bash
   cp .env .env.example
   # Edit .env.example to remove actual secrets, keep structure
   git add .env.example
   git commit -m "Add .env.example template"
   git push
   ```

2. **Add repository description and topics** on GitHub:
   - Topics: `strava`, `spotify`, `workout`, `visualization`, `python`, `flask`

3. **Consider adding a LICENSE file** if you want to open source it

## Troubleshooting

### Authentication Issues
If you get authentication errors:
- Use a Personal Access Token instead of password
- Or set up SSH keys: https://docs.github.com/en/authentication/connecting-to-github-with-ssh

### Branch Name Issues
If GitHub uses `master` instead of `main`:
```bash
git branch -m main
git push -u origin main
```

