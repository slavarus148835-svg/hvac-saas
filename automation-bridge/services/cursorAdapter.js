async function submitTask(task) {
  const isRevision =
    task &&
    task.latestRevision &&
    typeof task.revisionCount === "number" &&
    task.revisionCount > 0;

  const externalTaskId = isRevision
    ? `cursor-task-${task.id}-rev-${task.revisionCount}`
    : `cursor-task-${task.id}`;

  return {
    externalTaskId,
    agentStatus: "submitted",
    message: isRevision
      ? "Revision task prepared for Cursor submission"
      : "Task prepared for Cursor submission",
  };
}

module.exports = {
  submitTask,
};
