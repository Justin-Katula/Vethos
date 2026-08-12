import { useEffect, useState } from 'react'
import { animate } from 'framer-motion'

/**
 * Un nombre qui rejoint sa valeur au lieu d'y apparaître.
 *
 * Quand le chiffre change parce que tu viens de déclarer huit heures de cours,
 * le voir descendre dit quelque chose que le nouveau chiffre seul ne dit pas :
 * ce que ça t'a coûté.
 */
export function CountUp({
  value,
  format,
  className,
}: {
  value: number
  format: (n: number) => string
  className?: string
}) {
  const [shown, setShown] = useState(value)

  useEffect(() => {
    const controls = animate(shown, value, {
      duration: 0.7,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (latest) => setShown(latest),
    })
    return () => controls.stop()
    // `shown` est délibérément absent : le repartir de la valeur courante est
    // le point de départ de l'animation, pas une dépendance qui la relance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  return <span className={className}>{format(shown)}</span>
}
