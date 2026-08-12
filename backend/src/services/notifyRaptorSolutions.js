import { raptor, raptorEnabled } from "./raptor.js";

export { raptor, raptorEnabled };

function failMetadata(name, metadata = {}) {
  if (!metadata?.error && !metadata?.req) return metadata;

  const { error, req, httpStatus, extra = {} } = metadata;
  return {
    httpStatus,
    message: error?.message || name,
    path: req?.originalUrl || req?.url,
    params: req?.params,
    body: req?.body,
    user: req?.user,
    ...extra,
  };
}

export function notifyOk(type_key, name, metadata = {}) {
  if (!raptorEnabled) return;
  raptor.notifyOk(type_key, name, metadata);
}

export function notifyFail(type_key, name, metadata = {}) {
  if (!raptorEnabled) return;
  raptor.notifyFail(type_key, name, failMetadata(name, metadata));
}

export async function notifyRaptorSolutions(eventData) {
  if (!raptorEnabled) return null;
  return raptor.notify(eventData);
}

export function notifyRaptorSolutionsAsync(eventData) {
  if (!raptorEnabled) return;
  raptor.notifyOk(eventData.type_key, eventData.name, eventData.metadata);
}
