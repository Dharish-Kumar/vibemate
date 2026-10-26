// =====================================================
// vibeMate · tags.js
// Style tags (from the "Prompt Reference" sheet). Type "/" in the prompt box to pick one.
// The words sent to the image model live in Code.gs (TAG_PRESETS): the ids here must match those keys.
// To add a tag: add a line here, a matching line in Code.gs, and a preview image in public/assets/tags/<id>.jpg
//   group: "quality" = how the image looks · "angle" = where the camera is
// =====================================================
export const TAGS = [
    { id: "hdreal",         label: "HD real",          group: "quality", desc: "Enhanced HD photorealistic look" },
    { id: "4k",             label: "4K",               group: "quality", desc: "High-quality, detailed 4K image" },
    { id: "8k",             label: "8K",               group: "quality", desc: "Ultra-detailed, high-resolution image" },
    { id: "cinematic",      label: "Cinematic",        group: "quality", desc: "Cinematic lighting, composition and mood" },
    { id: "ultrarealistic", label: "Ultra realistic",  group: "quality", desc: "Extremely realistic visual output" },
    { id: "droneview",      label: "Drone view",       group: "angle",   desc: "Aerial drone-style perspective" },
    { id: "topdown",        label: "Top down",         group: "angle",   desc: "Direct top-down camera angle" },
    { id: "highangle",      label: "High angle",       group: "angle",   desc: "Camera looking down at the subject" },
    { id: "lowangle",       label: "Low angle",        group: "angle",   desc: "Dramatic camera angle from below" },
    { id: "sideview",       label: "Side view",        group: "angle",   desc: "Side-profile perspective" },
    { id: "aerialview",     label: "Aerial view",      group: "angle",   desc: "High-altitude view from above" }
];
// Files in public/ are served from the site root; BASE_URL keeps this working in a sub-folder too
export const tagImage = (id) => `${import.meta.env.BASE_URL}assets/tags/${id}.jpg`;
export const tagById = (id) => TAGS.find((t) => t.id === id);
