import fs from 'fs';
import path from 'path';
import os from 'os';
// In-memory store for testing
export class InMemorySuggestionStore {
    suggestion = null;
    save(suggestion) {
        this.suggestion = suggestion;
    }
    load() {
        return this.suggestion;
    }
    clear() {
        this.suggestion = null;
    }
}
// File-based store for production
export class FileSuggestionStore {
    getSuggestionPath() {
        const dataDir = path.join(os.homedir(), '.guitar-teacher');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }
        return path.join(dataDir, 'suggestion.json');
    }
    save(suggestion) {
        const filePath = this.getSuggestionPath();
        fs.writeFileSync(filePath, JSON.stringify(suggestion, null, 2));
    }
    load() {
        const filePath = this.getSuggestionPath();
        if (!fs.existsSync(filePath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(filePath, 'utf8');
            return JSON.parse(content);
        }
        catch {
            return null;
        }
    }
    clear() {
        const filePath = this.getSuggestionPath();
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
}
//# sourceMappingURL=suggestion.js.map