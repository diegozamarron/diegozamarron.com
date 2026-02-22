import logo from "../assets/logo.svg"
import './Navbar.css'
import { NavLink } from 'react-router-dom';

export default function Navbar(){
    return(
        <header className="navbar"> 
            <img className="logo" src={logo}></img>
            <nav className="nav-links">
                <NavLink 
                    to="/"
                    end
                    className={({ isActive}) => 
                        isActive ? "nav-link active" : "nav-link"
                    }
                >
                    home
                </NavLink>

                <NavLink
                    to="/projects"
                    className={({ isActive}) => 
                        isActive ? "nav-link active" : "nav-link"
                    }
                >
                    projects
                </NavLink>
                
                <NavLink
                    to="/about"
                    className={({ isActive}) => 
                        isActive ? "nav-link active" : "nav-link"
                    }
                >
                    about
                </NavLink>
            </nav>
        </header>
    )
}