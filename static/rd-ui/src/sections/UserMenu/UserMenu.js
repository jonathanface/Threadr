import React, {useState} from 'react';
import Person4Icon from '@mui/icons-material/Person4';
import { IconButton } from '@mui/material';
import {useSelector, useDispatch} from 'react-redux';
import {flipLoggedInState} from '../../stores/loggedInSlice';

const UserMenu = () => {
    const [isOpen, setIsOpen] = useState(false);
    const isLoggedIn = useSelector((state) => state.isLoggedIn.value);
    const dispatch = useDispatch();

    const signin = () => {
        window.location.href = '/auth/google';
      };

    const signout = () => {
        fetch('/logout/google', {
          method: 'DELETE'
        }).then((response) => {
          if (response.ok) {
            dispatch(flipLoggedInState());
            const history = window.history;
            history.pushState({}, '', '/');
            return;
          }
          throw new Error('Fetch problem logout ' + response.status);
        }).catch((error) => {
          console.error(error);
        });
      };

    return (
        <span className="user-menu">
        {isLoggedIn && (
            <span className="menu-container" onClick={()=>setIsOpen(!isOpen)} onMouseEnter={()=>setIsOpen(true)} onMouseLeave={()=>setIsOpen(false)}>
                <span className="icon">
                    <IconButton size="small" sx={{zIndex:99}} aria-label="user menu" >
                        <Person4Icon fontSize="small" className={'menu-icon'}/>
                    </IconButton>
                </span>
                {isOpen && (
                    <ul>
                        <li>Settings</li>
                        <li onClick={signout}>Signout</li>
                    </ul>
                )}
                
            </span>
        )}
        {!isLoggedIn && (
            <a onClick={signin}>Signin</a>
        )}
        </span>
    )
}

export default UserMenu;
