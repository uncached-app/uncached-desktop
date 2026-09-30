import { useCallback, useEffect, useState } from "react";
import { invoke, isTauri } from "@tauri-apps/api/core";
import { EMPTY_HYGIENE, type FetchResult, type Hygiene, type PruneResult } from "../types/hygiene";
import { describeFailure } from "../i18n/errors";

type State = {
  hygiene: Hygiene;
  loading: boolean;
  /** Set by a fetch, so the panel can say the number is current again. */
  fetchedAt: number | null;
  error: string | null;
  working: boolean;
};

/**
 * What one repository is carrying that nothing is using, and the two things that
 * can be done about it.
 *
 * Read on demand rather than during the index: this runs four Git processes per
 * project, and the workspace can hold 250 of them. The project page is where a
 * user is looking at one repository, and one repository is what this costs.
 */
export function useProjectHygiene(path: string | null) {
  const [state, setState] = useState<State>({
    hygiene: EMPTY_HYGIENE,
    loading: false,
    fetchedAt: null,
    error: null,
    working: false,
  });

  useEffect(() => {
    if (!isTauri() || !path) return;
    let current = true;
    setState((previous) => ({ ...previous, loading: true, error: null }));

    invoke<Hygiene>("project_hygiene", { path })
      .then((hygiene) => {
        if (!current) return;
        setState({
          hygiene,
          loading: false,
          fetchedAt: null,
          error: null,
          working: false,
        });
      })
      .catch((readError) => {
        if (!current) return;
        setState({
          hygiene: EMPTY_HYGIENE,
          loading: false,
          fetchedAt: null,
          error: describeFailure(readError),
          working: false,
        });
      });

    return () => {
      current = false;
    };
  }, [path]);

  // Both actions return the re-read repository, so the panel never has to guess
  // what changed: what comes back is what is now true.
  const fetchRemote = useCallback(async () => {
    if (!isTauri() || !path) return;
    setState((previous) => ({ ...previous, working: true, error: null }));
    try {
      const result = await invoke<FetchResult>("fetch_project", { path });
      setState((previous) => ({
        ...previous,
        hygiene: result.hygiene,
        fetchedAt: result.fetchedAt,
        working: false,
      }));
    } catch (fetchError) {
      setState((previous) => ({
        ...previous,
        working: false,
        error: describeFailure(fetchError),
      }));
    }
  }, [path]);

  const prune = useCallback(
    async (branches: string[]): Promise<PruneResult | null> => {
      if (!isTauri() || !path || branches.length === 0) return null;
      setState((previous) => ({ ...previous, working: true, error: null }));
      try {
        const result = await invoke<PruneResult>("prune_branches", { path, branches });
        setState((previous) => ({ ...previous, hygiene: result.hygiene, working: false }));
        return result;
      } catch (pruneError) {
        setState((previous) => ({
          ...previous,
          working: false,
          error: describeFailure(pruneError),
        }));
        return null;
      }
    },
    [path],
  );

  return { ...state, fetchRemote, prune };
}
