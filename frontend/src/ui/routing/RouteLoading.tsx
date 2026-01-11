import { RiverSkeleton } from '../river/RiverSkeleton'

/**
 * Loading state shown by route guards during auth check.
 * Shows minimal skeleton to avoid jarring transitions.
 * Timeout protection added in route guards ensures this never shows indefinitely.
 */
export function RouteLoading() {
  return (
    <div className="river u-hide-scroll">
      <div className="river__pad">
        <RiverSkeleton />
      </div>
    </div>
  )
}
