import { sequelize } from "../database/connection.js";
import {
  getAppTimezone,
  formatAppDateTime,
  nowApp,
} from "../utils/appDateTime.js";

async function fetchNetworkTime(timeZone) {
  const encoded = encodeURIComponent(timeZone);
  const sources = [
    {
      name: "worldtimeapi",
      url: `https://worldtimeapi.org/api/timezone/${encoded}`,
      parse: (data) => ({
        datetime: data.datetime,
        unixtime: data.unixtime,
      }),
    },
    {
      name: "timeapi.io",
      url: `https://timeapi.io/api/Time/current/zone?timeZone=${encoded}`,
      parse: (data) => ({
        datetime: data.dateTime,
        unixtime: Math.floor(new Date(data.dateTime).getTime() / 1000),
      }),
    },
  ];

  for (const src of sources) {
    try {
      const ac = new AbortController();
      const timer = setTimeout(() => ac.abort(), 5000);
      const res = await fetch(src.url, { signal: ac.signal });
      clearTimeout(timer);
      if (!res.ok) continue;
      const data = await res.json();
      const parsed = src.parse(data);
      if (!parsed?.datetime) continue;
      return { ...parsed, source: src.name };
    } catch {
      /* siguiente fuente */
    }
  }
  return null;
}

function shapeInstant(instant, timeZone) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) return null;
  return {
    iso: d.toISOString(),
    formatted: formatAppDateTime(d, { timeZone }),
    unix: Math.floor(d.getTime() / 1000),
  };
}

export async function getTimeStatus() {
  const timezone = getAppTimezone();
  const serverNow = nowApp();

  let dbRow = null;
  try {
    const [[row]] = await sequelize.query("SELECT NOW() AS dbNow");
    dbRow = row?.dbNow ?? null;
  } catch {
    dbRow = null;
  }

  const network = await fetchNetworkTime(timezone);
  const serverShape = shapeInstant(serverNow, timezone);
  const driftSeconds =
    network?.unixtime != null && serverShape?.unix != null
      ? serverShape.unix - network.unixtime
      : null;

  return {
    timezone,
    server: serverShape,
    database: dbRow ? shapeInstant(dbRow, timezone) : null,
    network: network
      ? {
          ...shapeInstant(network.datetime, timezone),
          source: network.source,
        }
      : null,
    driftSeconds,
    driftWarning: driftSeconds != null && Math.abs(driftSeconds) > 60,
  };
}
