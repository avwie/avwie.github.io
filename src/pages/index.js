import * as React from "react"
import DefaultLayout from "../layouts/default";
import {graphql, Link, useStaticQuery} from "gatsby";
import Img from "gatsby-image"

const PostItem = ({title, hero, date, excerpt, slug}) => {
    const image = hero.childImageSharp.fixed

    return (
        <div className="item">
            <div className="image">
                <Img fixed={image} />
            </div>
            <div className="content">
                <h2>{ title }</h2>
                <span>Published: {date}</span>
                <div className="synopsis">{ excerpt }</div>
                <Link to={slug}>>> Read more</Link>
            </div>
        </div>
    )
}


const Main = () => {
    const query = useStaticQuery(graphql`
        {
          allMarkdownRemark(sort: {order: DESC, fields: [frontmatter___date]}, limit: 1000) {
            edges {
              node {
                frontmatter {
                  title
                  slug
                  date(formatString: "DD-MMM yyyy")
                  hero {
                    childImageSharp {
                      fixed(width: 180, height: 180) {
                        ...GatsbyImageSharpFixed
                      }
                    }
                  }
                }
                excerpt(format: MARKDOWN, pruneLength: 300)
              }
            }
          }
        }
    `)

    const posts = query.allMarkdownRemark.edges.map(edge => {
        const data = {
            ...edge.node.frontmatter,
            excerpt: edge.node.excerpt
        }
        return <PostItem {...data} />
    })

    return <>
        <h1>Recent Posts</h1>
        <div className="posts">{ posts }</div>
    </>
}

const IndexPage = () => {
    return <DefaultLayout><div className="index"><Main /></div></DefaultLayout>
}

export default IndexPage
