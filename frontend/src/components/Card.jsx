import './Card.css'

export default function Card({ title, description, image, link }) {
  return (
    <a href={link} target="_blank" rel="noopener noreferrer" className="card">
      {image && <img src={image} alt={title} className="card-image" />}
      <div className="card-content">
        <h3 className="card-title">{title}</h3>
        <p className="card-description">{description}</p>
      </div>
    </a>
  );
}