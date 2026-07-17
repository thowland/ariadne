import { isArchived } from '@shared/domain/derive';

import { useStore } from '../app/store';
import { FileRow } from '../components/FileRow';
import { Dot } from '../components/primitives';

/**
 * Cross-project files library: every file and attachment in the workspace,
 * grouped by project in sidebar order. Rows open the regular file viewer.
 */
export function FilesLibrary(): React.JSX.Element {
  const { workspace } = useStore();
  const projects = workspace?.projects ?? [];
  const files = workspace?.files ?? [];

  const groups = projects
    .map((project) => ({
      project,
      files: files.filter((f) => f.projectId === project.id),
    }))
    .filter((g) => g.files.length > 0);

  return (
    <div className="view-wrap fadein" style={{ maxWidth: 900 }}>
      <div className="home-header">
        <div className="headline">
          <div className="eyebrow">FILES LIBRARY</div>
          <h1 className="hero-title" data-testid="files-headline">
            {files.length > 0
              ? `${files.length} file${files.length > 1 ? 's' : ''} across ${groups.length} project${groups.length > 1 ? 's' : ''}`
              : 'No files yet'}
          </h1>
        </div>
      </div>
      {groups.length > 0 ? (
        <div className="report-stack">
          {groups.map(({ project, files: projectFiles }) => (
            <div
              key={project.id}
              className="report-block"
              data-testid={`files-group-${project.id}`}
            >
              <div className="report-project-head">
                <Dot color={project.color} size={10} />
                <span className="report-project-name">{project.name}</span>
                <span className="card-count">{projectFiles.length}</span>
                {isArchived(project) && <span className="card-hint">archived</span>}
              </div>
              <div className="focus-section-body">
                {projectFiles.map((f) => (
                  <FileRow key={f.id} file={f} />
                ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card-empty">
          Files added to any project or task — markdown notes, uploads, references — show up here.
        </div>
      )}
    </div>
  );
}
