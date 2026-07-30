/**
 * Génération de calendriers iCalendar (RFC 5545).
 *
 * Permet d'importer le calendrier éditorial dans Google Agenda, Outlook,
 * Apple Calendar ou n'importe quel client compatible — le format d'échange
 * universel qui manquait à côté des exports JSON et CSV.
 */

export interface IcsEvent {
  uid: string;
  start: Date;
  /** Durée en minutes (30 par défaut). */
  durationMinutes?: number;
  summary: string;
  description?: string;
  url?: string;
  categories?: string[];
}

/** Horodatage UTC au format iCalendar : 20260614T100000Z. */
function toIcsDate(date: Date): string {
  return `${date.toISOString().replace(/[-:]/g, '').split('.')[0]}Z`;
}

/**
 * Échappe une valeur texte : les virgules, points-virgules et antislashs sont
 * des séparateurs dans la grammaire iCalendar, et les sauts de ligne doivent
 * être encodés littéralement.
 */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/**
 * Replie une ligne à 75 octets, comme l'exige la spécification. Le découpage
 * se fait sur les octets UTF-8 et jamais au milieu d'un caractère : couper un
 * « é » en deux produirait un fichier illisible.
 */
function foldLine(line: string): string {
  const bytes = Buffer.from(line, 'utf8');
  if (bytes.length <= 75) return line;

  const chunks: string[] = [];
  let start = 0;
  // 75 octets pour la première ligne, 74 pour les suivantes (préfixées d'une espace).
  let limit = 75;

  while (start < bytes.length) {
    let end = Math.min(start + limit, bytes.length);
    // Recule tant qu'on est sur un octet de continuation UTF-8 (10xxxxxx).
    while (end > start && end < bytes.length && (bytes[end] & 0xc0) === 0x80) {
      end--;
    }
    chunks.push(bytes.subarray(start, end).toString('utf8'));
    start = end;
    limit = 74;
  }

  return chunks.join('\r\n ');
}

export function buildIcs(calendarName: string, events: IcsEvent[], stamp: Date): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Buzzy//Calendrier editorial//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(calendarName)}`,
  ];

  for (const event of events) {
    const end = new Date(event.start.getTime() + (event.durationMinutes ?? 30) * 60_000);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${event.uid}`,
      `DTSTAMP:${toIcsDate(stamp)}`,
      `DTSTART:${toIcsDate(event.start)}`,
      `DTEND:${toIcsDate(end)}`,
      `SUMMARY:${escapeText(event.summary)}`,
    );
    if (event.description) lines.push(`DESCRIPTION:${escapeText(event.description)}`);
    if (event.url) lines.push(`URL:${escapeText(event.url)}`);
    if (event.categories?.length) {
      lines.push(`CATEGORIES:${event.categories.map(escapeText).join(',')}`);
    }
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  // CRLF obligatoire entre les lignes, et à la fin du fichier.
  return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
