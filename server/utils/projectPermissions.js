import path from 'path';
import { promises as fs } from 'fs';

function normalizeStringPath(input) {
  if (typeof input !== 'string') {
    return null;
  }

  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  return path.resolve(trimmed);
}

export function normalizeAllowedProjects(rawAllowedProjects) {
  if (!Array.isArray(rawAllowedProjects)) {
    return [];
  }

  const seen = new Set();
  const normalized = [];

  rawAllowedProjects.forEach((entry) => {
    const normalizedPath = normalizeStringPath(entry);
    if (!normalizedPath || seen.has(normalizedPath)) {
      return;
    }

    seen.add(normalizedPath);
    normalized.push(normalizedPath);
  });

  return normalized;
}

export function getProjectPermissions(source) {
  const projectPermissionsMode =
    source?.projectPermissionsMode === 'all'
      ? 'all'
      : Array.isArray(source?.allowedProjects)
        ? 'restricted'
        : 'all';

  if (projectPermissionsMode !== 'restricted') {
    return {
      projectPermissionsMode,
      allowedProjects: [],
    };
  }

  return {
    projectPermissionsMode,
    allowedProjects: normalizeAllowedProjects(source?.allowedProjects),
  };
}

export function isPathWithin(basePath, candidatePath) {
  const relativePath = path.relative(basePath, candidatePath);
  return relativePath === '' || (!relativePath.startsWith('..') && !path.isAbsolute(relativePath));
}

export function projectMatchesPermissions(projectPath, source) {
  const { projectPermissionsMode, allowedProjects } = getProjectPermissions(source);
  if (projectPermissionsMode !== 'restricted') {
    return true;
  }

  const normalizedProjectPath = path.resolve(projectPath);
  return allowedProjects.some(
    (allowedProjectPath) =>
      isPathWithin(allowedProjectPath, normalizedProjectPath) ||
      isPathWithin(normalizedProjectPath, allowedProjectPath),
  );
}

export function hasProjectAccess(projectPath, source) {
  const { projectPermissionsMode, allowedProjects } = getProjectPermissions(source);
  if (projectPermissionsMode !== 'restricted') {
    return true;
  }

  const normalizedProjectPath = path.resolve(projectPath);
  return allowedProjects.some((allowedProjectPath) => isPathWithin(allowedProjectPath, normalizedProjectPath));
}

export function pathMatchesPermissions(targetPath, source, { allowAncestorMatch = false } = {}) {
  const { projectPermissionsMode, allowedProjects } = getProjectPermissions(source);
  if (projectPermissionsMode !== 'restricted') {
    return true;
  }

  const normalizedTargetPath = path.resolve(targetPath);
  return allowedProjects.some((allowedProjectPath) => {
    if (isPathWithin(allowedProjectPath, normalizedTargetPath)) {
      return true;
    }

    return allowAncestorMatch ? isPathWithin(normalizedTargetPath, allowedProjectPath) : false;
  });
}

export function filterProjectsByPermissions(projects, source) {
  return projects.filter((project) => {
    const projectPath = project.path || project.fullPath || project.directory;
    return projectPath ? projectMatchesPermissions(projectPath, source) : false;
  });
}

export async function resolvePathForPermissionCheck(targetPath, { allowMissingLeaf = false } = {}) {
  const absolutePath = path.resolve(targetPath);

  try {
    return await fs.realpath(absolutePath);
  } catch (error) {
    if (error.code !== 'ENOENT' || !allowMissingLeaf) {
      return absolutePath;
    }

    const parentPath = path.dirname(absolutePath);
    if (parentPath === absolutePath) {
      return absolutePath;
    }

    const resolvedParentPath = await resolvePathForPermissionCheck(parentPath, { allowMissingLeaf: true });
    return path.join(resolvedParentPath, path.basename(absolutePath));
  }
}

export async function authorizeResolvedPath(targetPath, source, options = {}) {
  const resolvedPath = await resolvePathForPermissionCheck(targetPath, options);
  return {
    resolvedPath,
    allowed: pathMatchesPermissions(resolvedPath, source, options),
  };
}
