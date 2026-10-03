//! Machine-wide locations outside any workspace, reported as scan targets.

use super::*;

/// The scan a phase reports into: where its events go, what it counts towards,
/// the flag that stops it, and the queue that measures what it finds.
///
/// Carried together rather than one by one because a phase does not choose any
/// of them — it inherits them from the scan it belongs to, and four positional
/// arguments of the same shape are four chances to hand a phase the machinery
/// of a different scan.
pub(super) struct RunningScan<'a> {
    pub(super) id: &'a str,
    pub(super) events: &'a EventSink,
    pub(super) stats: &'a Arc<Mutex<ScanStats>>,
    pub(super) cancel: &'a Arc<AtomicBool>,
    pub(super) sizing: &'a SizingSubmitter,
}

/// Reports the catalogued locations that exist on this machine.
///
/// These live in the home directory, so no workspace walk reaches them however
/// long it runs — which is why this is a separate phase rather than another
/// provider. It runs once the walk has completed, and never after a cancel:
/// stopping a scan should stop everything the scan was going to do.
///
/// The targets register against the home directory with the catalogue's own
/// provider set, so cleanup validates them exactly as it validates anything
/// found in a workspace. Discovery widens what the product can see; it does not
/// widen what the product may delete.
pub(super) fn discover_home_locations(
    run: &RunningScan,
    home: &Path,
    wanted: &[uncached_core::Category],
    ignore_rules: &str,
) {
    let scan_id = run.id;
    // Filtered before anything is measured. A category the user turned off is
    // not walked, not sized and not reported — switching it off has to mean the
    // scan does less work, not that the results are hidden afterwards.
    let discoveries: Vec<_> = uncached_core::probe_home(home)
        .into_iter()
        // Scratch a tool keeps outside the home directory — a coding agent's
        // per-session working files live under the system temp directory, and
        // no catalogue written relative to `$HOME` can reach them.
        .chain(uncached_core::probe_temp(home))
        .chain(uncached_core::probe_system())
        .filter(|discovery| wanted.contains(&discovery.category))
        .collect();
    if discoveries.is_empty() {
        return;
    }
    // Said before the first of them is registered. The walk's counter has
    // stopped and the paths about to arrive are in the home directory rather
    // than under anything the user picked, so the screen is told the phase
    // changed instead of being left to present this as more of the same walk.
    lock(run.stats).phase = ScanPhase::Caches;
    emit_progress(run.events, scan_id, run.stats);
    // The same rules that prune the walk apply here. A catalogued location the
    // user excluded is not reported at all: offering it and then refusing to
    // clean it would be the worst of both.
    let providers = Arc::new(
        uncached_core::KnownLocationScanner::provider_set(home.to_path_buf())
            .with_ignore_rules(crate::scanner::compile_ignore_rules(ignore_rules).0),
    );
    // Once for the whole pass. Asking per location would run `ps` forty times
    // to answer a question whose answer cannot change meaningfully in between.
    let running = crate::workspace::running::running_commands();
    crate::logging::info(
        "scan",
        &format!(
            "discovery scanId=\"{scan_id}\" locations={} home=\"{}\"",
            discoveries.len(),
            home.display()
        ),
    );

    for discovery in &discoveries {
        if run.cancel.load(Ordering::Acquire) {
            return;
        }
        if providers.excludes(&discovery.path) {
            continue;
        }
        let target = ScanTarget::from_discovery(scan_id, discovery, &running);

        let mut registry = lock(registry());
        let Some(session) = registry.sessions.get_mut(scan_id) else {
            return;
        };
        if session.cancelled || session.cancel_token.load(Ordering::Acquire) {
            return;
        }
        session.target_ids.insert(target.id.clone());
        session.register_size_job(target.id.clone());
        registry.targets.insert(
            target.id.clone(),
            RegisteredTarget {
                target: target.clone(),
                // The root the discovery reports, not the home directory.
                //
                // Cleanup refuses anything outside the root its target was
                // registered against. Registering everything against home
                // was true until session scratch, which lives under `/tmp`
                // — so the largest thing this pass finds was offered on
                // screen and then refused on removal.
                root_path: discovery.root.clone(),
                providers: Arc::clone(&providers),
                owner: discovery.owner,
            },
        );
        drop(registry);

        lock(run.stats).targets_found += 1;
        emit_target_found(run.events, scan_id, &target);
        emit_progress(run.events, scan_id, run.stats);
        if !run.sizing.submit(SizingJob {
            scan_id: scan_id.to_owned(),
            target_id: target.id.clone(),
            path: target.path.clone(),
        }) {
            return;
        }
    }
}
