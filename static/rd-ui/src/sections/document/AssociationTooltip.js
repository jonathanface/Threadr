import React, {useEffect, useState} from 'react';
import {Box, Tooltip} from '@mui/material';
import '../../css/association-tooltip.css';

export default function AssociationTooltip(props) {
  const [portrait, setPortrait] = useState('/img/default_association_portrait.jpg');
  const [name, setName] = useState('someone or something');
  const [description, setDescription] = useState('Descriptive text goes here.');

  useEffect(() => {
    setPortrait(props.portrait + '?' + new Date().getTime());
    setName(props.name);
    setDescription(props.description);
  }, [props]);

  return (
    <Tooltip placement="top" title={
      <div className="association-tooltip-body">
        <div className="row">
          <span className="column">
            <Box
              component="img"
              sx={{
                maxHeight: 100,
                margin: 'auto'
              }}
              alt={name}
              src={portrait}
            />
          </span>
          <span className="column">
            {description}
          </span>
        </div>
      </div>
    } sx={{
      backgroundColor: '#445c66;',
      border: '1px solid #333',
      borderRadius: '10px',
    }}>{props.children}
    </Tooltip>
  );
}
