const fs = require('fs');
['src/index.ts','src/state.ts','src/config.ts','src/utils.ts'].forEach(f => {
  let c = fs.readFileSync(f, 'utf-8');
  c = c.replace(/from\s+['"](\.\/[^'"]+)\.js['"]/g, "from '$1'");
  fs.writeFileSync(f, c);
});
