export interface AlertBlock {
  readonly from: number;
  readonly to: number;
  readonly type: 'note' | 'tip' | 'important' | 'warning' | 'caution';
  readonly marker: { readonly from: number; readonly to: number };
}

export function findAlerts(source: string): readonly AlertBlock[] {
  const alerts: AlertBlock[] = [];
  for (const match of source.matchAll(/^>\s*(\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\])\s*$/gmu)) {
    const marker = match[1] ?? '';
    const markerFrom = match.index + match[0].indexOf(marker);
    let to = match.index + match[0].length;
    while (source.slice(to).startsWith('\n>')) {
      const nextEnd = source.indexOf('\n', to + 1);
      to = nextEnd === -1 ? source.length : nextEnd;
    }
    alerts.push({
      from: match.index,
      to,
      type: (match[2] ?? 'NOTE').toLocaleLowerCase() as AlertBlock['type'],
      marker: { from: markerFrom, to: markerFrom + marker.length }
    });
  }
  return alerts;
}
