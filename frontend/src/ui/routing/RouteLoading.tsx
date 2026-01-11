import { RiverSkeleton } from '../river/RiverSkeleton'

export function RouteLoading() {
  return (
    <div className="river u-hide-scroll">
      <div className="river__pad">
        <RiverSkeleton />
      </div>
    </div>
  )
}
