import fs from 'fs';
import path from 'path';
import os from 'os';
import { RhythmSig, ScaleSig, PositionSig, NotePatternSig } from '../types.js';

export interface Suggestion {
  rhythm: RhythmSig;
  scale: ScaleSig;
  position: PositionSig;
  notePattern: NotePatternSig;
  key: string;
  reasoning: string;
  generatedAt: string;
}

export interface SuggestionStore {
  save(suggestion: Suggestion): void;
  load(): Suggestion | null;
  clear(): void;
}

// In-memory store for testing
export class InMemorySuggestionStore implements SuggestionStore {
  private suggestion: Suggestion | null = null;

  save(suggestion: Suggestion): void {
    this.suggestion = suggestion;
  }

  load(): Suggestion | null {
    return this.suggestion;
  }

  clear(): void {
    this.suggestion = null;
  }
}

// File-based store for production
export class FileSuggestionStore implements SuggestionStore {
  private getSuggestionPath(): string {
    const dataDir = path.join(os.homedir(), '.guitar-teacher');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    return path.join(dataDir, 'suggestion.json');
  }

  save(suggestion: Suggestion): void {
    const filePath = this.getSuggestionPath();
    fs.writeFileSync(filePath, JSON.stringify(suggestion, null, 2));
  }

  load(): Suggestion | null {
    const filePath = this.getSuggestionPath();
    if (!fs.existsSync(filePath)) {
      return null;
    }
    try {
      const content = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(content) as Suggestion;
    } catch {
      return null;
    }
  }

  clear(): void {
    const filePath = this.getSuggestionPath();
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
}
