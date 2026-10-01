import * as m from '../../paraglide/messages.js';
import { type Area } from './queue-api';

// The area in the Reviewer's words. One place, so the dossier and the
// in-flight detail cannot name the same ask two ways.

export function areaHeadline(area: Area): string {
  if (area.kind === 'national') return m.requester_area_national();
  return area.region === null
    ? provinceNames(area)
    : m.requester_area_region_selected({ region: area.region });
}

// A named region shows the provinces it stands for beneath it; a hand-picked
// list already is the provinces, so there is nothing to repeat under it.
export function areaProvinces(area: Area): string | null {
  return area.kind === 'provinces' && area.region !== null
    ? provinceNames(area)
    : null;
}

function provinceNames(area: Extract<Area, { kind: 'provinces' }>): string {
  return area.provinces.map((p) => p.name).join(', ');
}

// The area on one line, as the dossier's row reads it: a region by its name
// and how many provinces it is stored as (*เขตสุขภาพที่ 4 · 8 จังหวัด*), no
// chips; a hand-picked list by its names; the whole country in words.
export function areaLine(area: Area): string {
  if (area.kind === 'provinces' && area.region !== null) {
    return `${areaHeadline(area)} · ${m.reviewer_area_province_count({
      count: area.provinces.length,
    })}`;
  }
  return areaHeadline(area);
}
