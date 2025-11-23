import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: '/studio-booking/', // ★ここが重要！リポジトリ名と一致させる
})
```

```bash
git add .
git commit -m "fix: Add base path for GitHub Pages"
git push origin main
```

```bash
npm run build
```

```bash
npm run deploy