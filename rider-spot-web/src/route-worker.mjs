import { analyzeCourse } from "./route-analysis.mjs";

self.onmessage = ({ data }) => {
  const { requestId, points, events } = data;
  try {
    self.postMessage({ requestId, course: analyzeCourse(points, events) });
  } catch (error) {
    self.postMessage({ requestId, error: error.message });
  }
};
