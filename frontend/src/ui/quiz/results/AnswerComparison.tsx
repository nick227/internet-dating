type Props = {
  percentages: {
    siteAverage: number
    userGender: number
    oppositeGender: number
    userAgeGroup: number
    userCity: number
    otherCity: number
  }
}

export function AnswerComparison({ percentages }: Props) {
  return (
    <div className="answer-comparison">
      <div className="comparison-item">
        <span className="comparison-label">Site average</span>
        <span className="comparison-value">{percentages.siteAverage}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your gender</span>
        <span className="comparison-value">{percentages.userGender}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Opposite gender</span>
        <span className="comparison-value">{percentages.oppositeGender}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your age group</span>
        <span className="comparison-value">{percentages.userAgeGroup}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Your city</span>
        <span className="comparison-value">{percentages.userCity}%</span>
      </div>
      
      <div className="comparison-item">
        <span className="comparison-label">Other city</span>
        <span className="comparison-value">{percentages.otherCity}%</span>
      </div>
    </div>
  )
}
